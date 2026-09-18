"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createBillingPortal, createCreditPackCheckout, createSubscriptionCheckout } from "@/lib/stripe";
import { integrations } from "@/lib/env";
import type { BillingInterval } from "@/lib/plans";
import { guard, type ActionResult } from "@/server/action-result";

export async function startSubscriptionCheckout(plan: "CREATOR" | "PRO" | "AGENCY", interval: BillingInterval): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const user = await requireUser();
    if (!integrations.stripe()) throw new Error("Billing is not configured yet. Add your Stripe keys to enable checkout.");
    const url = await createSubscriptionCheckout(user.id, plan, interval);
    return { url };
  });
}

export async function startCreditPackCheckout(packId: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const user = await requireUser();
    if (!integrations.stripe()) throw new Error("Billing is not configured yet. Add your Stripe keys to enable checkout.");
    const url = await createCreditPackCheckout(user.id, packId);
    return { url };
  });
}

export async function openBillingPortal(): Promise<never> {
  const user = await requireUser();
  const url = await createBillingPortal(user.id);
  redirect(url);
}
