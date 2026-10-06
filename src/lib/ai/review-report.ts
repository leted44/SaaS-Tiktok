import { z } from "zod/v4";
import { countWords } from "@/lib/utils";

/**
 * Was the critic pass worth it?
 *
 * generateScript writes a draft, then a critic rewrites it. Only the rewrite
 * is kept, so nobody could tell what the second call — about half the cost of
 * a script — actually changed. This compares the two versions against the
 * rules the writer is given, with code only (no extra AI call), and says
 * which broken rules the critic fixed, which ones it broke, and how much it
 * rewrote. Computed for videos and carousels alike, since both scripts go
 * through the same two passes.
 */

export const REVIEW_VERDICTS = ["useful", "regressed", "style", "minor", "skipped"] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const reviewReportSchema = z.object({
  format: z.enum(["video", "carousel"]),
  verdict: z.enum(REVIEW_VERDICTS),
  /** Rules the draft broke and the final version keeps. */
  fixes: z.array(z.string()),
  /** Rules the draft kept and the final version breaks. */
  regressions: z.array(z.string()),
  /** Things worth a look that are not a rule either way (new figures, scene count…). */
  notes: z.array(z.string()),
  /** Share of the narration's words the critic changed, 0–100. */
  changedPct: z.number(),
  hookChanged: z.boolean(),
  draftCostUsd: z.number().nullable(),
  reviewCostUsd: z.number().nullable(),
  draft: z.object({ hook: z.string(), scenes: z.array(z.string()), callToAction: z.string() }),
  /** The draft's broken rules that made the critic run; empty when it was skipped. */
  triggers: z.array(z.string()).default([]),
  /** The critic broke a rule without fixing any, so the draft was kept instead. */
  keptDraft: z.boolean().default(false),
  /** Estimated cost of the critic call not made, when it was skipped. */
  savedUsd: z.number().nullable().default(null),
});
export type ReviewReport = z.infer<typeof reviewReportSchema>;

interface Version {
  hook: string;
  scenes: { text: string }[];
  callToAction: string;
}

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** US dollars per million tokens. Cache reads cost a tenth of input, cache writes 1.25×. */
const PRICES: { prefix: string; input: number; output: number }[] = [
  { prefix: "claude-opus-5-5", input: 4, output: 20 },
  { prefix: "claude-opus-5", input: 5, output: 25 },
  { prefix: "claude-sonnet-5-5", input: 2, output: 10 },
];

export function callCostUsd(model: string, usage: Usage): number | null {
  const price = PRICES.find((p) => model.startsWith(p.prefix));
  if (!price) return null;
  const perToken = (n: number | null | undefined, rate: number) => ((n ?? 0) * rate) / 1_000_000;
  return (
    perToken(usage.input_tokens, price.input) +
    perToken(usage.cache_read_input_tokens, price.input * 0.1) +
    perToken(usage.cache_creation_input_tokens, price.input * 1.25) +
    perToken(usage.output_tokens, price.output)
  );
}

const narration = (v: Version) => [v.hook, ...v.scenes.map((s) => s.text), v.callToAction].join(" ");
const firstSentenceWords = (hook: string) => countWords(hook.split(/[.!?…]/)[0] ?? hook);
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Symbols and shorthand the synthetic voice reads wrongly (see SCRIPT_SYSTEM_PROMPT). */
const TTS_TRAPS = /[×%&+/→~]|\b(?:1re|exos?|min|kg|vs|etc)\b/giu;
const ttsTraps = (v: Version) => [v.hook, ...v.scenes.map((s) => s.text), v.callToAction].join(" ").match(TTS_TRAPS) ?? [];

/** A first-person past episode or a client's story: what NO_INVENTED_EXPERIENCE forbids unless the brief states it. */
const OWN_STORY = /\b(?:j['’]ai\s+(?:perdu|gagné|pris|testé|essayé|commencé|arrêté|fait|vu|eu|passé|découvert|appris)|quand j['’]étais|mes client(?:e)?s|ma cliente|mon client|on me payait|I (?:lost|gained|tried|used to)|my clients)\b/iu;

/** Figures that carry a claim: 11 and above, or anything with a decimal. Small counts ("3 séries") are advice, not claims. */
function claimFigures(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = Number(m[0].replace(",", "."));
    if (n > 10 || /[.,]/.test(m[0])) out.add(m[0].replace(",", "."));
  }
  return out;
}

/** A headline that announces a number of items: «5 preuves», «3 erreurs». */
function announcedCount(hook: string): number | null {
  const m = hook.match(/\b([2-9]|10)\s+(?!pour\b|%|ans\b|jours?\b|semaines?\b|mois\b|minutes?\b|secondes?\b|kilos?\b|heures?\b)\p{L}{3,}/iu);
  return m ? Number(m[1]) : null;
}

/** Share of words changed between two texts, from their longest common word subsequence. */
function changedShare(a: string, b: string): number {
  const x = normalize(a).split(" ").filter(Boolean);
  const y = normalize(b).split(" ").filter(Boolean);
  if (!x.length && !y.length) return 0;
  let prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const row = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) row[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    prev = row;
  }
  const common = prev[y.length];
  return Math.round((1 - (2 * common) / (x.length + y.length)) * 100);
}

interface RuleArgs {
  topic: string;
  carousel: boolean;
  /** Content slides the carousel asks for (1, 2 or 4); ignored for a video. */
  contentSlides?: number;
  targetDurationSec: number;
}

interface Rule {
  ok: (v: Version) => boolean;
  /** Said when the draft breaks it (why the critic runs). */
  problem: (v: Version) => string;
  /** Said when the critic fixed it. */
  fixed: (draft: Version, final: Version) => string;
  /** Said when the critic broke it. */
  broken: (final: Version) => string;
}

const words = (v: Version) => countWords(narration(v));
const seconds = (v: Version) => Math.round(words(v) / 2.6);

/** The rules a script is checked against — the measurable part of what the writer is told. */
function rulesFor(args: RuleArgs): Rule[] {
  const targetWords = Math.round(args.targetDurationSec * 2.6);
  const slides = args.contentSlides ?? "?";
  const rules: Rule[] = args.carousel
    ? [
        {
          ok: (v) => countWords(v.hook) <= 12 && v.hook.trim().length <= 80,
          problem: (v) => `Titre de couverture trop long : ${countWords(v.hook)} mots (12 max, 80 caractères)`,
          fixed: (d, f) => `Titre de couverture raccourci : ${countWords(d.hook)} → ${countWords(f.hook)} mots (12 max, 80 caractères)`,
          broken: () => "Titre de couverture devenu trop long (plus de 12 mots ou 80 caractères)",
        },
        {
          ok: (v) => /\?/.test(v.scenes.at(-1)?.text ?? ""),
          problem: () => "Pas de question sur la dernière slide",
          fixed: () => "Question en un mot ajoutée sur la dernière slide",
          broken: () => "Question de la dernière slide supprimée",
        },
        {
          ok: (v) => {
            const n = announcedCount(v.hook);
            return n === null || !args.contentSlides || n === args.contentSlides;
          },
          problem: (v) => `La couverture annonce ${announcedCount(v.hook)} éléments pour ${slides} slides de contenu`,
          fixed: () => `Nombre annoncé en couverture aligné sur les ${slides} slides de contenu`,
          broken: () => `La couverture annonce un nombre différent des ${slides} slides de contenu`,
        },
      ]
    : [
        {
          ok: (v) => firstSentenceWords(v.hook) <= 8,
          problem: (v) => `Accroche trop longue : ${firstSentenceWords(v.hook)} mots dans la 1re phrase (8 max)`,
          fixed: (d, f) => `Accroche raccourcie : ${firstSentenceWords(d.hook)} → ${firstSentenceWords(f.hook)} mots dans la 1re phrase (8 max)`,
          broken: (f) => `Accroche rallongée au-delà de 8 mots (${firstSentenceWords(f.hook)} mots)`,
        },
        {
          ok: (v) => Math.abs(words(v) - targetWords) <= targetWords * 0.15,
          problem: (v) => `Durée hors cible : ${seconds(v)} s pour ${args.targetDurationSec} s demandées`,
          fixed: (d, f) => `Durée ramenée dans la cible : ${seconds(d)} s → ${seconds(f)} s (cible ${args.targetDurationSec} s)`,
          broken: (f) => `Durée sortie de la cible : ${seconds(f)} s pour ${args.targetDurationSec} s demandées`,
        },
        {
          ok: (v) => ttsTraps(v).length === 0,
          problem: (v) => `Symboles / abréviations que la voix lit mal : ${[...new Set(ttsTraps(v))].join(" ")}`,
          fixed: (d) => `Symboles / abréviations retirés, que la voix lit mal : ${[...new Set(ttsTraps(d))].join(" ")}`,
          broken: (f) => `Symboles / abréviations ajoutés, que la voix lit mal : ${[...new Set(ttsTraps(f))].join(" ")}`,
        },
      ];
  rules.push({
    ok: (v) => !OWN_STORY.test(narration(v)),
    problem: () => "Anecdote personnelle inventée",
    fixed: () => "Anecdote personnelle inventée retirée",
    broken: () => "Anecdote personnelle inventée ajoutée",
  });
  return rules;
}

/**
 * The draft's broken rules, in words — empty when the draft already keeps
 * every rule that can be checked. The critic only runs when this is not
 * empty: on the first scripts it ran on drafts that broke nothing, rewrote
 * them for taste, and once made the video 35 % longer than asked.
 */
export function draftProblems(draft: Version, args: RuleArgs): string[] {
  return rulesFor(args).filter((r) => !r.ok(draft)).map((r) => r.problem(draft));
}

/** Figures in the script that the brief does not give — worth checking before publishing. */
function unsourcedFigures(v: Version, topic: string): string[] {
  const brief = claimFigures(topic);
  return [...claimFigures(narration(v))].filter((n) => !brief.has(n));
}

/** The report when the draft broke nothing and the critic was not called. */
export function skippedReviewReport(args: RuleArgs & { draft: Version; draftCost: { model: string; usage: Usage } }): ReviewReport {
  const draftCostUsd = callCostUsd(args.draftCost.model, args.draftCost.usage);
  const figures = unsourcedFigures(args.draft, args.topic);
  return {
    format: args.carousel ? "carousel" : "video",
    verdict: "skipped",
    fixes: [],
    regressions: [],
    notes: figures.length ? [`Chiffre(s) absent(s) de ton sujet — à vérifier avant de publier : ${figures.join(", ")}`] : [],
    changedPct: 0,
    hookChanged: false,
    draftCostUsd,
    reviewCostUsd: null,
    draft: { hook: args.draft.hook, scenes: args.draft.scenes.map((s) => s.text), callToAction: args.draft.callToAction },
    triggers: [],
    keptDraft: false,
    // On the scripts measured so far the critic cost 1.5× the draft (it reads the draft and thinks harder).
    savedUsd: draftCostUsd === null ? null : draftCostUsd * 1.5,
  };
}

export function buildReviewReport(args: RuleArgs & {
  draft: Version;
  final: Version;
  draftCost: { model: string; usage: Usage };
  reviewCost: { model: string; usage: Usage };
}): ReviewReport {
  const { draft, final, carousel } = args;
  const rules = rulesFor(args);

  const fixes: string[] = [];
  const regressions: string[] = [];
  for (const rule of rules) {
    const before = rule.ok(draft);
    const after = rule.ok(final);
    if (!before && after) fixes.push(rule.fixed(draft, final));
    if (before && !after) regressions.push(rule.broken(final));
  }

  // Figures: one in the draft that is neither in the brief nor kept is likely an invented one the critic caught.
  const brief = claimFigures(args.topic);
  const before = claimFigures(narration(draft));
  const after = claimFigures(narration(final));
  const dropped = [...before].filter((n) => !after.has(n) && !brief.has(n));
  const added = [...after].filter((n) => !before.has(n) && !brief.has(n));
  if (dropped.length) fixes.push(`Chiffre(s) retiré(s), absent(s) de ton sujet — sans doute inventé(s) : ${dropped.join(", ")}`);

  const notes: string[] = [];
  if (added.length) notes.push(`Chiffre(s) ajouté(s) par la relecture, absent(s) de ton sujet — à vérifier avant de publier : ${added.join(", ")}`);
  if (draft.scenes.length !== final.scenes.length) notes.push(`${carousel ? "Slides" : "Scènes"} : ${draft.scenes.length} → ${final.scenes.length}`);

  const hookChanged = normalize(draft.hook) !== normalize(final.hook);
  const changedPct = changedShare(narration(draft), narration(final));
  const verdict: ReviewVerdict = fixes.length ? "useful" : regressions.length ? "regressed" : hookChanged || changedPct >= 30 ? "style" : "minor";

  return {
    format: carousel ? "carousel" : "video",
    verdict,
    fixes,
    regressions,
    notes,
    changedPct,
    hookChanged,
    draftCostUsd: callCostUsd(args.draftCost.model, args.draftCost.usage),
    reviewCostUsd: callCostUsd(args.reviewCost.model, args.reviewCost.usage),
    draft: { hook: draft.hook, scenes: draft.scenes.map((s) => s.text), callToAction: draft.callToAction },
    triggers: draftProblems(draft, args),
    keptDraft: false,
    savedUsd: null,
  };
}

/** Tally of the latest reports, for "utile 6 fois sur 10". */
export function reviewTally(reports: ReviewReport[]) {
  const count = (v: ReviewVerdict) => reports.filter((r) => r.verdict === v).length;
  const reviewCostUsd = reports.reduce((sum, r) => sum + (r.reviewCostUsd ?? 0), 0);
  const savedUsd = reports.reduce((sum, r) => sum + (r.savedUsd ?? 0), 0);
  return { total: reports.length, useful: count("useful"), regressed: count("regressed"), style: count("style"), minor: count("minor"), skipped: count("skipped"), reviewCostUsd, savedUsd };
}
export type ReviewTally = ReturnType<typeof reviewTally>;
