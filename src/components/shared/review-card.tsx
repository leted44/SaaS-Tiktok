"use client";

import { useState } from "react";
import { ChevronDown, ScanSearch } from "lucide-react";
import type { ReviewReport, ReviewTally, ReviewVerdict } from "@/lib/ai/review-report";
import { cn } from "@/lib/utils";

const VERDICTS: Record<ReviewVerdict, { label: string; tone: string; explain: (r: ReviewReport) => string }> = {
  useful: {
    label: "Utile",
    tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    explain: (r) => `La 1re version cassait ${r.fixes.length > 1 ? `${r.fixes.length} règles` : "une règle"} ; la relecture l'a corrigé.`,
  },
  regressed: {
    label: "Contre-productive",
    tone: "border-red-400/30 bg-red-400/10 text-red-200",
    explain: (r) => (r.keptDraft ? "La relecture a cassé une règle sans en corriger aucune : la 1re version a été gardée." : "La 1re version respectait les règles ; la relecture en a cassé une. Compare les deux versions."),
  },
  style: {
    label: "Style seulement",
    tone: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    explain: (r) => `Aucune règle cassée dans la 1re version. La relecture a réécrit ${r.changedPct} % du texte${r.hookChanged ? ", accroche comprise" : ""} : un gain de goût, que seul ton œil (ou les stats) peut juger.`,
  },
  minor: {
    label: "Pas nécessaire",
    tone: "border-white/10 bg-white/[0.04] text-muted-foreground",
    explain: (r) => `La 1re version respectait déjà les règles, et la relecture n'a changé que ${r.changedPct} % du texte.`,
  },
  off: {
    label: "Désactivée",
    tone: "border-white/10 bg-white/[0.04] text-muted-foreground",
    explain: (r) => (r.triggers.length ? "Pas de relecture : le script est gardé tel qu'il a été écrit. Ces règles ne sont pas respectées — à corriger à la main, ou régénère le script :" : "Pas de relecture : le script respecte toutes les règles vérifiables."),
  },
  skipped: {
    label: "Non lancée",
    tone: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    explain: (r) => `La 1re version respectait toutes les règles vérifiables : pas de relecture${r.savedUsd !== null ? `, environ ${usd(r.savedUsd)} économisés` : ""}.`,
  },
};

const usd = (n: number | null) => (n === null ? "?" : `${n.toFixed(3).replace(".", ",")} $`);

/**
 * What the critic pass did to this script — admin only.
 *
 * Every script is written twice: a draft, then a critic that rewrites it.
 * This says, from a code comparison of the two, whether the second call
 * fixed a broken rule, broke one, or only reworded — and what it cost — so
 * the owner can decide on evidence whether it earns its place.
 */
export function ReviewCard({ report, tally }: { report: ReviewReport; tally: ReviewTally | null }) {
  const [showDraft, setShowDraft] = useState(false);
  const verdict = VERDICTS[report.verdict];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <ScanSearch className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold">Relecture</span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", verdict.tone)}>{verdict.label}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{report.verdict === "skipped" || report.verdict === "off" ? `script ${usd(report.draftCostUsd)}` : `coût ${usd(report.reviewCostUsd)} · 1re version ${usd(report.draftCostUsd)}`}</span>
      </div>
      <p className="mt-2 leading-relaxed text-muted-foreground">{verdict.explain(report)}</p>
      {report.triggers.length > 0 && <p className={cn("mt-1.5 text-[11px]", report.verdict === "off" ? "text-amber-200" : "text-muted-foreground")}>{report.verdict === "off" ? "À vérifier" : "Lancée parce que"} : {report.triggers.join(" · ")}</p>}

      {(report.fixes.length > 0 || report.regressions.length > 0 || report.notes.length > 0) && (
        <ul className="mt-2 space-y-1">
          {report.fixes.map((f) => <li key={f} className="text-emerald-200">✓ {f}</li>)}
          {report.regressions.map((f) => <li key={f} className="text-red-200">✗ {f}</li>)}
          {report.notes.map((f) => <li key={f} className="text-amber-200">• {f}</li>)}
        </ul>
      )}

      {tally && tally.total > 1 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Sur tes {tally.total} derniers scripts {report.format === "carousel" ? "carrousel" : "vidéo"} : {tally.off ? `désactivée ${tally.off}, ` : ""}non lancée {tally.skipped}, utile {tally.useful}, style {tally.style}, pas nécessaire {tally.minor}
          {tally.regressed ? `, contre-productive ${tally.regressed}` : ""} — relectures {usd(tally.reviewCostUsd)} au total{tally.savedUsd > 0 ? `, environ ${usd(tally.savedUsd)} économisés` : ""}.
        </p>
      )}

      {report.verdict !== "skipped" && report.verdict !== "off" && (
        <>
      <button
        type="button"
        onClick={() => setShowDraft((o) => !o)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground"
      >
        Voir la 1re version
        <ChevronDown className={cn("h-3 w-3 transition-transform", showDraft && "rotate-180")} />
      </button>
      {showDraft && (
        <div className="mt-2 space-y-1.5 rounded-lg bg-black/20 p-2 leading-relaxed text-muted-foreground">
          <p><span className="font-semibold text-foreground">Accroche :</span> {report.draft.hook}</p>
          {report.draft.scenes.map((s, i) => (
            <p key={i}><span className="font-semibold text-foreground">{report.format === "carousel" ? "Slide" : "Scène"} {i + 1} :</span> {s}</p>
          ))}
          <p><span className="font-semibold text-foreground">Fin :</span> {report.draft.callToAction}</p>
        </div>
      )}
        </>
      )}
    </div>
  );
}
