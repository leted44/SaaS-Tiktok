import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe, planForPrice } from "@/lib/stripe";
import { env } from "@/lib/env";
import { PLANS } from "@/lib/plans";
import { grantCredits, resetMonthlyCredits } from "@/lib/credits";
import type { Plan, SubscriptionStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "incomplete":
    case "incomplete_expired":
      return "INCOMPLETE";
    default:
      return "NONE";
  }
}

async function userIdForCustomer(customerId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  return user?.id ?? null;
}

async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = (sub.metadata?.userId as string | undefined) ?? (await userIdForCustomer(customerId));
  if (!userId) return;

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const plan: Plan = planForPrice(priceId) ?? ((sub.metadata?.plan as Plan | undefined) ?? "FREE");
  const status = mapStatus(sub.status);
  const isActive = status === "ACTIVE" || status === "TRIALING" || status === "PAST_DUE";
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      subscriptionStatus: status,
      plan: isActive ? plan : "FREE",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = (sub.metadata?.userId as string | undefined) ?? (await userIdForCustomer(customerId));
  if (!userId) return;
  await prisma.user.update({
    where: { id: userId },
    data: { plan: "FREE", subscriptionStatus: "CANCELED", stripeSubscriptionId: null, stripePriceId: null, cancelAtPeriodEnd: false, currentPeriodEnd: null },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const userId = await userIdForCustomer(customerId);
  if (!userId) return;
  const line = invoice.lines.data.find((l) => l.pricing?.price_details?.price);
  const rawPrice = line?.pricing?.price_details?.price ?? null;
  const priceId = typeof rawPrice === "string" ? rawPrice : (rawPrice?.id ?? null);
  const plan = planForPrice(priceId);
  if (!plan) return; // one-time purchases are handled via checkout.session.completed
  const alreadyGranted = await prisma.creditTransaction.findFirst({ where: { userId, referenceId: invoice.id, type: "SUBSCRIPTION_GRANT" } });
  if (alreadyGranted) return;
  await prisma.user.update({ where: { id: userId }, data: { plan, subscriptionStatus: "ACTIVE" } });
  await resetMonthlyCredits(userId, PLANS[plan].monthlyCredits, invoice.id);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) return;
  if (session.metadata?.kind === "credits") {
    const credits = Number(session.metadata.credits);
    const alreadyGranted = await prisma.creditTransaction.findFirst({ where: { userId, referenceId: session.id } });
    if (alreadyGranted || !Number.isFinite(credits) || credits <= 0) return;
    await grantCredits(userId, credits, "PURCHASE", `Purchased ${credits} credits`, session.id);
    return;
  }
  if (session.mode === "subscription" && session.subscription) {
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    const sub = await stripe().subscriptions.retrieve(subId);
    await syncSubscription(sub);
  }
}

export async function POST(req: Request) {
  if (!env.stripe.webhookSecret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, env.stripe.webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${err instanceof Error ? err.message : "unknown"}` }, { status: 400 });
  }

  // Idempotency: Stripe retries; process each event at most once.
  const seen = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncSubscription(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) await prisma.user.updateMany({ where: { stripeCustomerId: customerId }, data: { subscriptionStatus: "PAST_DUE" } });
        break;
      }
      default:
        break;
    }
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    console.error(`[stripe:${event.type}]`, err);
    // 500 makes Stripe retry with backoff.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
