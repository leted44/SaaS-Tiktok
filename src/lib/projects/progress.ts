import type { Prisma, ProjectStatus } from "@prisma/client";
import { parseJson, visualLayersSchema } from "@/lib/validations";
import { formatDuration } from "@/lib/utils";

/**
 * Where a project stands, worked out from what exists for it — a script, a
 * voice-over, visuals, a finished render, a publication — never estimated.
 * Shared by the dashboard and the projects page so both say the same thing.
 */

export type StepKey = "script" | "voice" | "visuals" | "captions" | "export";
export type StepState = "done" | "active" | "todo";
export interface WorkflowStep {
  key: StepKey;
  label: string;
  state: StepState;
  detail: string;
}

export interface ProjectCardData {
  id: string;
  title: string;
  topic: string | null;
  status: ProjectStatus;
  aspectRatio: "VERTICAL" | "SQUARE" | "HORIZONTAL";
  updatedAt: Date;
  thumbnailUrl: string | null;
  /** The latest finished render, to preview in place. */
  videoUrl: string | null;
  /** "0:42" from the voice-over, "~45 s" from the script, or the target. */
  duration: string | null;
  scores: { virality: number; hook: number; retention: number; clarity: number; rationale: string | null } | null;
  steps: WorkflowStep[];
  doneCount: number;
  next: { label: string; href: string };
  rendering: { progress: number } | null;
  episode: { number: number; total: number } | null;
  hasScript: boolean;
  /** Which of the three shelves it sits on. */
  stage: ProjectStage;
  /** manual: marked by hand (and so can be unmarked), as opposed to published through a connected account. */
  posted: { at: Date | null; platforms: string[]; manual: boolean } | null;
}

export type ProjectStage = "todo" | "ready" | "posted";

export const PROJECT_PROGRESS_SELECT = {
  id: true,
  title: true,
  topic: true,
  status: true,
  aspectRatio: true,
  updatedAt: true,
  thumbnailUrl: true,
  activeScriptId: true,
  visualLayers: true,
  episodeNumber: true,
  episodeTotal: true,
  postedAt: true,
  postedPlatforms: true,
  scripts: { orderBy: { version: "desc" }, take: 3, select: { id: true, wordCount: true, estimatedDurationSec: true, viralityScore: true, hookScore: true, retentionScore: true, clarityScore: true, scoreRationale: true } },
  voiceovers: { where: { status: "READY" }, orderBy: { createdAt: "desc" }, take: 3, select: { scriptId: true, durationMs: true } },
  renderJobs: { orderBy: { createdAt: "desc" }, take: 4, select: { status: true, progress: true, outputUrl: true, thumbnailUrl: true } },
  publishJobs: { where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 5, select: { platform: true, publishedAt: true } },
} satisfies Prisma.ProjectSelect;

export type ProjectProgressRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_PROGRESS_SELECT }>;

const PLATFORM_KEY: Record<string, string> = { TIKTOK: "tiktok", INSTAGRAM: "instagram", YOUTUBE: "youtube" };

/** Where a video can be marked as posted by hand. */
export const POST_PLATFORMS = ["tiktok", "instagram", "youtube", "facebook", "autre"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];
export const POST_PLATFORM_LABELS: Record<PostPlatform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", facebook: "Facebook", autre: "Autre" };

export function buildProjectProgress(p: ProjectProgressRow): ProjectCardData {
  const script = p.scripts.find((s) => s.id === p.activeScriptId) ?? p.scripts[0] ?? null;
  const voice = script ? (p.voiceovers.find((v) => v.scriptId === script.id) ?? null) : null;
  const layers = parseJson(visualLayersSchema, p.visualLayers, []).filter((l) => Boolean(l.src));
  const lastRender = p.renderJobs[0] ?? null;
  const finished = p.renderJobs.find((r) => r.status === "COMPLETED" && r.outputUrl) ?? null;
  const inProgress = lastRender && (lastRender.status === "QUEUED" || lastRender.status === "PROCESSING") ? lastRender : null;
  // Posted by hand, or published through a connected account.
  const autoPosts = p.publishJobs;
  const posted = p.postedAt || autoPosts.length > 0 || p.status === "PUBLISHED"
    ? { manual: Boolean(p.postedAt), at: p.postedAt ?? autoPosts[0]?.publishedAt ?? null, platforms: [...new Set([...p.postedPlatforms, ...autoPosts.map((j) => PLATFORM_KEY[j.platform] ?? j.platform.toLowerCase())])] }
    : null;
  const published = Boolean(posted);

  const hasVisuals = layers.length > 0;
  const raw: Omit<WorkflowStep, "state">[] = [
    { key: "script", label: "Script", detail: script ? `${script.wordCount} mots` : "À écrire" },
    { key: "voice", label: "Voix", detail: voice?.durationMs ? formatDuration(voice.durationMs) : "À générer" },
    { key: "visuals", label: "Visuels", detail: hasVisuals ? `${layers.length} plan${layers.length > 1 ? "s" : ""}` : finished ? "Fond animé" : "À choisir" },
    { key: "captions", label: "Sous-titres", detail: voice ? "Synchronisés" : "Après la voix" },
    { key: "export", label: "Export", detail: published ? "Publiée" : finished ? "Rendu terminé" : inProgress ? `${inProgress.progress} %` : "À lancer" },
  ];
  const done: Record<StepKey, boolean> = {
    script: Boolean(script),
    voice: Boolean(voice),
    visuals: hasVisuals || Boolean(finished),
    // Captions are timed from the voice-over's words: they exist as soon as it does.
    captions: Boolean(voice),
    export: Boolean(finished),
  };
  const firstOpen = raw.findIndex((s) => !done[s.key]);
  const steps: WorkflowStep[] = raw.map((s, i) => ({ ...s, state: done[s.key] ? "done" : i === firstOpen ? "active" : "todo" }));

  const studio = `/studio/${p.id}`;
  const next = !script
    ? { label: "Générer le script", href: `/scripts?project=${p.id}` }
    : !voice
      ? { label: "Générer la voix off", href: studio }
      : inProgress
        ? { label: "Suivre le rendu", href: studio }
        : !finished && !hasVisuals
          ? { label: "Choisir les visuels", href: studio }
          : !finished
            ? { label: lastRender?.status === "FAILED" ? "Relancer le rendu" : "Lancer le rendu", href: studio }
            : published
              ? { label: "Ouvrir dans le studio", href: studio }
              : { label: "Publier ou partager", href: "/exports" };

  const duration = voice?.durationMs ? formatDuration(voice.durationMs) : script?.estimatedDurationSec ? `~${script.estimatedDurationSec} s` : null;
  const scored = script && script.viralityScore > 0;

  return {
    id: p.id,
    title: p.title,
    topic: p.topic,
    status: p.status,
    aspectRatio: p.aspectRatio,
    updatedAt: p.updatedAt,
    thumbnailUrl: p.thumbnailUrl ?? finished?.thumbnailUrl ?? null,
    videoUrl: finished?.outputUrl ?? null,
    duration,
    scores: scored ? { virality: script.viralityScore, hook: script.hookScore, retention: script.retentionScore, clarity: script.clarityScore, rationale: script.scoreRationale } : null,
    steps,
    doneCount: steps.filter((s) => s.state === "done").length,
    next,
    rendering: inProgress ? { progress: inProgress.progress } : null,
    episode: p.episodeNumber && p.episodeTotal ? { number: p.episodeNumber, total: p.episodeTotal } : null,
    hasScript: Boolean(script),
    stage: posted ? "posted" : finished ? "ready" : "todo",
    posted,
  };
}

