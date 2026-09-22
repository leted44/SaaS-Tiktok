import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { legalUpdatedLabel, missingLegalFields } from "@/lib/legal";

/**
 * Shared shell for the three legal pages.
 *
 * The amber banner only appears while `src/lib/legal.ts` still has empty
 * fields: the operator sees it on their own site, which is a far better
 * reminder than a code comment nobody reopens.
 */
export function LegalPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const missing = missingLegalFields();
  return (
    <main className="container max-w-3xl py-16">
      <h1 className="font-display text-3xl font-bold md:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : {legalUpdatedLabel}</p>
      {intro && <p className="mt-6 leading-relaxed text-muted-foreground">{intro}</p>}

      {missing.length > 0 && (
        <div className="mt-8 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="text-sm text-amber-200">
            <p className="font-semibold">Page incomplète — à finaliser avant toute inscription développeur</p>
            <p className="mt-1 text-amber-200/80">
              Renseignez {missing.join(", ")} dans <code className="rounded bg-black/30 px-1 py-0.5 text-[11px]">src/lib/legal.ts</code>. TikTok, Meta et Google lisent ces pages pendant la revue : un champ vide entraîne un refus.
            </p>
          </div>
        </div>
      )}

      <div className="mt-10 space-y-8">{children}</div>
    </main>
  );
}

export function Article({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** A plain definition row — used for the data tables and the processor list. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-white/[0.06] py-2.5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
      <span className="text-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
