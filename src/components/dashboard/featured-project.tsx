import Link from "next/link";
import { ArrowRight, Clock, Gauge, Layers3, Sparkles } from "lucide-react";
import type { ProjectCardData } from "@/app/(app)/dashboard/data";
import { StatusBadge } from "@/components/shared/status-badge";
import { Poster } from "@/components/dashboard/poster";
import { FeaturedMedia } from "@/components/dashboard/featured-media";
import { Workflow } from "@/components/dashboard/workflow";
import { ScoreBars, ViralityRing } from "@/components/dashboard/scores";
import { relativeTime } from "@/lib/utils";

const ASPECT: Record<ProjectCardData["aspectRatio"], string> = { VERTICAL: "9:16", SQUARE: "1:1", HORIZONTAL: "16:9" };

/** The project to pick up, with where it stands and the one thing to do next. */
export function FeaturedProject({ project }: { project: ProjectCardData }) {
  const p = project;
  const finished = p.steps.every((s) => s.state === "done");
  return (
    <section aria-labelledby="featured-title" className="group/card relative overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#0e0b18] shadow-card">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-violet-600/15 blur-3xl" />

      <div className="relative flex items-center justify-between gap-3 px-5 pt-5 sm:px-7 sm:pt-6">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-400" /></span>
          {finished ? "Dernière vidéo" : "Projet en cours"}
        </p>
        <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">Tous les projets <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>

      <div className="relative grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-5 p-5 [grid-template-areas:'poster_head'_'flow_flow'_'score_score'_'cta_cta'] sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-x-6 sm:p-7 lg:grid-cols-[168px_minmax(0,1fr)_252px] lg:[grid-template-areas:'poster_head_score'_'poster_flow_score'_'poster_cta_score']">
        <div className="[grid-area:poster]">
          <div className="group relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
            <Poster id={p.id} title={p.title} thumbnailUrl={p.thumbnailUrl} className="absolute inset-0">
              {p.videoUrl ? <FeaturedMedia videoUrl={p.videoUrl} poster={p.thumbnailUrl} /> : null}
            </Poster>
            {p.rendering && (
              <div className="absolute inset-x-2 bottom-2 rounded-lg bg-black/60 p-1.5 backdrop-blur">
                <div className="h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-brand-gradient" style={{ width: `${p.rendering.progress}%` }} /></div>
                <p className="mt-1 text-center text-[9px] text-white/80">Rendu {p.rendering.progress} %</p>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 [grid-area:head]">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={p.status} />
            {p.episode && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Épisode {p.episode.number}/{p.episode.total}</span>}
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{ASPECT[p.aspectRatio]}</span>
          </div>
          <h2 id="featured-title" className="mt-2.5 line-clamp-3 font-display text-lg font-bold leading-snug tracking-tight sm:text-2xl lg:text-[1.7rem]">
            <Link href={p.next.href} className="transition hover:text-brand-100">{p.title}</Link>
          </h2>
          {p.topic && p.topic !== p.title && <p className="mt-1.5 line-clamp-2 hidden text-sm text-muted-foreground sm:block">{p.topic}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Modifié {relativeTime(p.updatedAt)}</span>
            {p.duration && <span className="inline-flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> {p.duration}</span>}
            <span className="inline-flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" /> {p.doneCount}/5 étapes</span>
          </p>
        </div>

        <div className="[grid-area:flow] lg:self-center">
          <Workflow steps={p.steps} />
        </div>

        <div className="[grid-area:score] lg:border-l lg:border-white/[0.06] lg:pl-6">
          {p.scores ? (
            <div className="flex items-center gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 lg:flex-col lg:items-stretch lg:border-0 lg:bg-transparent lg:p-0">
              <div className="flex justify-center"><ViralityRing value={p.scores.virality} id={p.id} size={92} /></div>
              <div className="min-w-0 flex-1">
                <ScoreBars scores={p.scores} />
                {p.scores.rationale && <p className="mt-3 line-clamp-3 hidden text-[11px] leading-relaxed text-muted-foreground lg:block">{p.scores.rationale}</p>}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center gap-3 rounded-2xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground lg:flex-col lg:justify-center lg:text-center">
              <Sparkles className="h-5 w-5 shrink-0 text-brand-300" />
              Le score de viralité, de hook, de rétention et de clarté apparaît dès que le script est écrit.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 [grid-area:cta] sm:flex-row sm:items-center">
          <Link
            href={p.next.href}
            className="group/cta relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(219,39,119,0.8)] transition duration-300 hover:shadow-[0_14px_40px_-8px_rgba(219,39,119,0.95)] hover:brightness-110"
          >
            {finished ? p.next.label : "Continuer"} <ArrowRight className="h-4 w-4 transition-transform motion-safe:group-hover/cta:translate-x-0.5" />
          </Link>
          {!finished && (
            <p className="text-center text-xs text-muted-foreground sm:text-left">
              Prochaine étape : <span className="font-medium text-foreground">{p.next.label}</span>
            </p>
          )}
          {finished && <Link href={`/studio/${p.id}`} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 px-4 text-sm text-muted-foreground transition hover:border-white/25 hover:text-foreground">Ouvrir le studio</Link>}
        </div>
      </div>
    </section>
  );
}

/** First visit: what a project is, and where to start one. */
export function FirstProject() {
  const steps = [
    ["1", "Décris ton idée", "Une phrase suffit : l'IA écrit le hook, les scènes et le CTA."],
    ["2", "Ajuste dans le studio", "Voix off, visuels, sous-titres animés, musique."],
    ["3", "Exporte et publie", "Rendu 9:16 prêt pour TikTok, Reels et Shorts."],
  ];
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-dashed border-white/10 bg-white/[0.015] p-5 sm:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200">Ton premier projet</p>
      <h2 className="mt-2 font-display text-xl font-bold sm:text-2xl">Trois étapes entre ton idée et ta vidéo.</h2>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map(([n, title, body]) => (
          <li key={n} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">{n}</span>
            <p className="mt-3 text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
      <a href="#quick-create" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-200 transition hover:text-brand-100">Commencer par une idée <ArrowRight className="h-4 w-4" /></a>
    </section>
  );
}
