"use client";

import { useState } from "react";
import { Check, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startSubscriptionCheckout } from "@/server/actions/billing";
import { PLANS, PLAN_ORDER, type BillingInterval } from "@/lib/plans";
import { formatCurrency, cn } from "@/lib/utils";
import type { Plan } from "@prisma/client";

export function PlanGrid({ currentPlan, stripeConfigured }: { currentPlan: Plan; stripeConfigured: boolean }) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [loading, setLoading] = useState<string | null>(null);

  async function choose(plan: Plan) {
    if (plan === "FREE") return;
    setLoading(plan);
    const res = await startSubscriptionCheckout(plan as "CREATOR", interval);
    setLoading(null);
    if (!res.ok) return toast.error(res.error);
    window.location.href = res.data.url;
  }

  return (
    <div>
      <div className="mb-6 inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1 text-sm">
        {(["month", "year"] as const).map((i) => (
          <button key={i} onClick={() => setInterval(i)} className={cn("rounded-lg px-4 py-1.5 font-medium transition", interval === i ? "bg-white/[0.08] text-foreground" : "text-muted-foreground")}>
            {i === "month" ? "Monthly" : <>Yearly <span className="ml-1 text-xs text-emerald-300">−20%</span></>}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const price = interval === "month" ? plan.priceMonthly : Math.round(plan.priceYearly / 12);
          const current = id === currentPlan;
          const rank = PLAN_ORDER.indexOf(id) - PLAN_ORDER.indexOf(currentPlan);
          return (
            <div key={id} className={cn("surface relative flex flex-col p-6", plan.highlight && !current && "border-primary/40", current && "border-emerald-500/40")}>
              {current ? <Badge variant="success" className="absolute -top-3 left-6">Current plan</Badge> : plan.highlight && <Badge variant="gradient" className="absolute -top-3 left-6">Most popular</Badge>}
              <h3 className="font-display text-lg font-bold">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-3xl font-bold">{price === 0 ? "Free" : formatCurrency(price)}</span>
                {price > 0 && <span className="text-xs text-muted-foreground">/mo{interval === "year" && ", billed yearly"}</span>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{plan.monthlyCredits} credits / month</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {plan.features.map((f) => <li key={f} className="flex gap-2 text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{f}</li>)}
              </ul>
              <Button className="mt-6" variant={current ? "secondary" : rank > 0 ? "gradient" : "outline"} disabled={current || id === "FREE" || !stripeConfigured} loading={loading === id} onClick={() => choose(id)}>
                {current ? "Your plan" : id === "FREE" ? "Included" : rank > 0 ? <><Zap /> Upgrade</> : "Switch"}
              </Button>
            </div>
          );
        })}
      </div>
      {!stripeConfigured && <p className="mt-4 text-xs text-amber-300">Stripe keys are not configured — checkout is disabled on this deployment.</p>}
    </div>
  );
}
