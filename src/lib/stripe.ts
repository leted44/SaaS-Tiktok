import Stripe from "stripe";
import { env } from "@/lib/env";
import { PLANS, CREDIT_PACKS, type BillingInterval } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  if (!env.stripe.secretKey) throw new Error("Stripe n'est pas configuré (clé STRIPE_SECRET_KEY manquante).");
  if (!stripeClient) stripeClient = new Stripe(env.stripe.secretKey, { typescript: true });
  return stripeClient;
}

export function priceIdForPlan(plan: Exclude<Plan, "FREE">, interval: BillingInterval): string {
  const id = env.stripe.prices[plan][interval];
  if (!id) throw new Error(`Aucun tarif Stripe configuré pour ${plan} (${interval}).`);
  return id;
}

export function priceIdForPack(packId: string): string {
  const id = env.stripe.creditPacks[packId as keyof typeof env.stripe.creditPacks];
  if (!id) throw new Error(`Aucun tarif Stripe configuré pour le pack ${packId}.`);
  return id;
}

export function creditsForPackPrice(priceId: string): number | null {
  for (const pack of CREDIT_PACKS) {
    if (env.stripe.creditPacks[pack.id] === priceId) return pack.credits;
  }
  return null;
}

export function planForPrice(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  for (const plan of ["CREATOR", "PRO", "AGENCY"] as const) {
    const p = env.stripe.prices[plan];
    if (p.month === priceId || p.year === priceId) return plan;
  }
  return null;
}

/** Get or lazily create the Stripe customer for a user. */
export async function ensureStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId },
  });
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

export async function createSubscriptionCheckout(userId: string, plan: Exclude<Plan, "FREE">, interval: BillingInterval) {
  const customer = await ensureStripeCustomer(userId);
  const session = await stripe().checkout.sessions.create({
    customer,
    mode: "subscription",
    line_items: [{ price: priceIdForPlan(plan, interval), quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${env.appUrl}/billing?success=subscription`,
    cancel_url: `${env.appUrl}/billing?canceled=1`,
    subscription_data: { metadata: { userId, plan } },
    metadata: { userId, kind: "subscription", plan },
  });
  return session.url!;
}

export async function createCreditPackCheckout(userId: string, packId: string) {
  const customer = await ensureStripeCustomer(userId);
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Pack de crédits inconnu");
  const session = await stripe().checkout.sessions.create({
    customer,
    mode: "payment",
    line_items: [{ price: priceIdForPack(packId), quantity: 1 }],
    success_url: `${env.appUrl}/billing?success=credits`,
    cancel_url: `${env.appUrl}/billing?canceled=1`,
    metadata: { userId, kind: "credits", packId, credits: String(pack.credits) },
  });
  return session.url!;
}

export async function createBillingPortal(userId: string) {
  const customer = await ensureStripeCustomer(userId);
  const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${env.appUrl}/billing` });
  return session.url;
}

export function planMonthlyCredits(plan: Plan) {
  return PLANS[plan].monthlyCredits;
}
