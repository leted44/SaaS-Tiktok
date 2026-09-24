import Link from "next/link";
import { Flame } from "lucide-react";
import type { ProjectCardData } from "@/app/(app)/dashboard/data";
import { Poster } from "@/components/dashboard/poster";
import { WorkflowBar } from "@/components/dashboard/workflow";
import { relativeTime } from "@/lib/utils";

const STATUS: Record<string, string> = {
  DRAFT: "Brouillon",
  SCRIPTED: "Scripté",
  VOICED: "Voix prête",
  READY: "Prêt",
  RENDERING: "Rendu…",
  RENDERED: "Rendu",
  PUBLISHED: "Publié",
  FAILED: "Échec",
};

/** A recent project as a video cover: status, score, length, progress. */
export function ProjectCard({ project: p, style }: { project: ProjectCardData; style?: React.CSSProperties }) {
  return (
    <Link
      href={p.next.href.startsWith("/scripts") ? p.next.href : `/studio/${p.id}`}
      style={style}
      className="group relative block w-[46vw] max-w-[190px] shrink-0 snap-start rounded-2xl ring-focus transition duration-300 motion-safe:hover:-translate-y-1 sm:w-auto sm:max-w-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700 motion-safe:fill-mode-both"
    >
      <Poster id={p.id} title={p.title} thumbnailUrl={p.thumbnailUrl} className="aspect-[9/16] rounded-2xl border border-white/[0.08] shadow-[0_16px_40px_-20px_rgba(0,0,0,0.9)] transition duration-300 group-hover:border-white/20 ">
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/10" />
        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-1">
          <span className="rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-md">
            {p.rendering ? `Rendu ${p.rendering.progress} %` : (STATUS[p.status] ?? p.status)}
          </span>
          {p.scores && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-md" title="Score de viralité">
              <Flame className="h-3 w-3 text-white/70" /> {p.scores.virality}
            </span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 space-y-2 p-3">
          <p className="line-clamp-3 text-[13px] font-semibold leading-snug text-white">{p.title}</p>
          <p className="flex items-center gap-1.5 text-[10px] text-white/60">
            {p.duration && <span>{p.duration}</span>}
            {p.duration && <span aria-hidden>·</span>}
            <span className="truncate">{relativeTime(p.updatedAt)}</span>
            {p.episode && <span className="ml-auto shrink-0 rounded bg-white/10 px-1">É{p.episode.number}/{p.episode.total}</span>}
          </p>
          <WorkflowBar steps={p.steps} />
        </div>
      </Poster>
    </Link>
  );
}
