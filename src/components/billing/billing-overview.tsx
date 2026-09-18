"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, CalendarDays, ExternalLink, Sparkles, Mic2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { openBillingPortal } from "@/server/actions/billing";
import { PLANS, CREDIT_COSTS } from "@/lib/plans";
import type { Plan } from "@prisma/client";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "actif",
  TRIALING: "essai",
  PAST_DUE: "paiement en retard",
  CANCELED: "annulé",
  UNPAID: "impayé",
  INCOMPLETE: "incomplet",
  NONE: "aucun",
};

interface Props {
  user: { plan: Plan; credits: number; subscriptionStatus: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; hasStripeCustomer: boolean };
  usage: { byType: Record<string, { credits: number; count: number }>; totalUsed: number };
  flash: { success?: string; canceled?: string };
  stripeConfigured: boolean;
}

export function BillingOverview({ user, usage, flash, stripeConfigured }: Props) {
  const router = useRouter();
  const plan = PLANS[user.plan];
  const pct = Math.min(100, Math.round((user.credits / Math.max(1, plan.monthlyCredits)) * 100));

  useEffect(() => {
    if (flash.success === "subscription") toast.success("Abonnement actif ! Les crédits se rechargeront à chaque cycle de facturation.");
    if (flash.success === "credits") toast.success("Crédits ajoutés à votre solde.");
    if (flash.canceled) toast.info("Paiement annulé.");
    if (flash.success || flash.canceled) router.replace("/billing");
  }, [flash.success, flash.canceled, router]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="surface relative overflow-hidden p-6 md:col-span-2">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Forfait actuel</p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="font-display text-3xl font-bold">{plan.name}</h2>
              <Badge variant={user.subscriptionStatus === "PAST_DUE" ? "warning" : user.plan === "FREE" ? "secondary" : "success"}>{user.plan === "FREE" ? "Gratuit" : STATUS_LABEL[user.subscriptionStatus] ?? user.subscriptionStatus}</Badge>
              {user.cancelAtPeriodEnd && <Badge variant="warning">Annulation en fin de période</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
          </div>
          {user.hasStripeCustomer && stripeConfigured && (
            <form action={openBillingPortal}>
              <Button type="submit" variant="secondary"><ExternalLink /> Gérer l'abonnement</Button>
            </form>
          )}
        </div>
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium"><Coins className="h-4 w-4 text-brand-300" /> {user.credits} crédits disponibles</span>
            <span className="text-muted-foreground">{plan.monthlyCredits} / mois sur ce forfait</span>
          </div>
          <Progress value={pct} indicatorClassName={pct < 20 ? "bg-amber-400" : "bg-brand-gradient"} className="h-2.5" />
          {user.currentPeriodEnd && <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Prochaine recharge le {new Date(user.currentPeriodEnd).toLocaleDateString("fr-FR", { month: "long", day: "numeric" })}</p>}
        </div>
      </div>
      <div className="surface p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">30 derniers jours</p>
        <p className="mt-1 font-display text-3xl font-bold">{usage.totalUsed} <span className="text-base font-normal text-muted-foreground">crédits utilisés</span></p>
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex items-center justify-between"><span className="inline-flex items-center gap-2 text-muted-foreground"><Sparkles className="h-4 w-4" /> Scripts</span><span>{usage.byType.SCRIPT_GENERATION?.count ?? 0} · {CREDIT_COSTS.SCRIPT_GENERATION} cr chacun</span></li>
          <li className="flex items-center justify-between"><span className="inline-flex items-center gap-2 text-muted-foreground"><Mic2 className="h-4 w-4" /> Voix off</span><span>{usage.byType.VOICEOVER?.count ?? 0} · {CREDIT_COSTS.VOICEOVER_PER_30S} cr / 30s</span></li>
          <li className="flex items-center justify-between"><span className="inline-flex items-center gap-2 text-muted-foreground"><Film className="h-4 w-4" /> Rendus</span><span>{usage.byType.RENDER?.count ?? 0} · {CREDIT_COSTS.RENDER_1080P} cr (1080p)</span></li>
        </ul>
      </div>
    </div>
  );
}
