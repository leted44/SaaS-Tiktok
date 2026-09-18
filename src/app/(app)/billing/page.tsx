import type { Metadata } from "next";
import { getBillingData } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { BillingOverview } from "@/components/billing/billing-overview";
import { PlanGrid } from "@/components/billing/plan-grid";
import { CreditPacks } from "@/components/billing/credit-packs";
import { TransactionHistory } from "@/components/billing/transaction-history";
import { integrations } from "@/lib/env";

export const metadata: Metadata = { title: "Billing & credits" };
export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ success?: string; canceled?: string }> }) {
  const [params, data] = await Promise.all([searchParams, getBillingData()]);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Billing & credits" description="Credits fund scripts, voiceovers and renders. Subscriptions refill monthly; credit packs never expire." />
      <BillingOverview
        user={{ plan: data.user.plan, credits: data.user.credits, subscriptionStatus: data.user.subscriptionStatus, currentPeriodEnd: data.user.currentPeriodEnd?.toISOString() ?? null, cancelAtPeriodEnd: data.user.cancelAtPeriodEnd, hasStripeCustomer: Boolean(data.user.stripeCustomerId) }}
        usage={data.usage}
        flash={params}
        stripeConfigured={integrations.stripe()}
      />
      <section className="mt-10">
        <h2 className="mb-4 font-display text-xl font-bold">Plans</h2>
        <PlanGrid currentPlan={data.user.plan} stripeConfigured={integrations.stripe()} />
      </section>
      <section className="mt-10">
        <h2 className="mb-1 font-display text-xl font-bold">Credit packs</h2>
        <p className="mb-4 text-sm text-muted-foreground">One-time top-ups for busy weeks. Available on every plan.</p>
        <CreditPacks stripeConfigured={integrations.stripe()} />
      </section>
      <section className="mt-10">
        <h2 className="mb-4 font-display text-xl font-bold">Credit history</h2>
        <TransactionHistory transactions={data.transactions.map((t) => ({ id: t.id, type: t.type, amount: t.amount, balanceAfter: t.balanceAfter, description: t.description, createdAt: t.createdAt.toISOString() }))} />
      </section>
    </div>
  );
}
