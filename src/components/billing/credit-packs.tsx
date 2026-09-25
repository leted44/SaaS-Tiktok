"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startCreditPackCheckout } from "@/server/actions/billing";
import { CREDIT_PACKS } from "@/lib/plans";
import { formatCurrency } from "@/lib/utils";

export function CreditPacks({ stripeConfigured }: { stripeConfigured: boolean }) {
  const [loading, setLoading] = useState<string | null>(null);
  async function buy(id: string) {
    setLoading(id);
    const res = await startCreditPackCheckout(id);
    setLoading(null);
    if (!res.ok) return toast.error(res.error);
    window.location.href = res.data.url;
  }
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {CREDIT_PACKS.map((p) => (
        <div key={p.id} className="surface flex items-center justify-between p-5">
          <div>
            <p className="inline-flex items-center gap-2 font-semibold"><Coins className="h-4 w-4 text-brand-300" /> {p.label} {p.bonus && <Badge variant="success">{p.bonus}</Badge>}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(p.price)} · {(p.price / p.credits / 100).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/crédit</p>
          </div>
          <Button variant="secondary" onClick={() => buy(p.id)} loading={loading === p.id} disabled={!stripeConfigured}>Acheter</Button>
        </div>
      ))}
    </div>
  );
}
