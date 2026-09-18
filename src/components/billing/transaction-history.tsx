import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  SIGNUP_BONUS: "Crédits de bienvenue", SUBSCRIPTION_GRANT: "Recharge du forfait", PURCHASE: "Pack de crédits", SCRIPT_GENERATION: "Script", VOICEOVER: "Voix off", RENDER: "Rendu", REFUND: "Remboursement", ADMIN_ADJUSTMENT: "Ajustement",
};

export function TransactionHistory({ transactions }: { transactions: { id: string; type: string; amount: number; balanceAfter: number; description: string; createdAt: string }[] }) {
  if (transactions.length === 0) return <p className="text-sm text-muted-foreground">Aucune transaction pour l'instant.</p>;
  return (
    <div className="surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-4 py-2.5 font-medium">Date</th><th className="px-4 py-2.5 font-medium">Type</th><th className="px-4 py-2.5 font-medium">Description</th><th className="px-4 py-2.5 text-right font-medium">Crédits</th><th className="px-4 py-2.5 text-right font-medium">Solde</th></tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {transactions.map((t) => (
            <tr key={t.id} className="hover:bg-white/[0.02]">
              <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{new Date(t.createdAt).toLocaleString("fr-FR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              <td className="px-4 py-2.5">{LABEL[t.type] ?? t.type}</td>
              <td className="max-w-[320px] truncate px-4 py-2.5 text-muted-foreground">{t.description}</td>
              <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums", t.amount > 0 ? "text-emerald-300" : "text-foreground")}>{t.amount > 0 ? "+" : ""}{t.amount}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{t.balanceAfter}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
