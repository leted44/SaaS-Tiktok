import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getCurrentWorkspace } from "@/server/queries";
import { getUsageSummary } from "@/lib/credits";
import { CREDIT_COSTS, effectivePlanDef, isAdmin } from "@/lib/plans";
import { integrations } from "@/lib/env";
import { parseJson, visualLayersSchema } from "@/lib/validations";
import { formatDuration } from "@/lib/utils";

/**
 * Everything the dashboard shows, read from the data the rest of the app
 * already writes — nothing here is estimated or made up. A project's
 * workflow is worked out from what exists for it: a script, a voice-over,
 * visuals, a finished render.
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
}

export interface AgendaEntry {
  id: string;
  kind: "post" | "autopilot";
  title: string;
  at: Date;
  detail: string;
  platform?: "TIKTOK" | "INSTAGRAM" | "YOUTUBE";
  href: string;
}

function buildProject(p: Awaited<ReturnType<typeof loadProjects>>[number]): ProjectCardData {
  const script = p.scripts.find((s) => s.id === p.activeScriptId) ?? p.scripts[0] ?? null;
  const voice = script ? (p.voiceovers.find((v) => v.scriptId === script.id) ?? null) : null;
  const layers = parseJson(visualLayersSchema, p.visualLayers, []).filter((l) => Boolean(l.src));
  const lastRender = p.renderJobs[0] ?? null;
  const finished = p.renderJobs.find((r) => r.status === "COMPLETED" && r.outputUrl) ?? null;
  const inProgress = lastRender && (lastRender.status === "QUEUED" || lastRender.status === "PROCESSING") ? lastRender : null;
  const published = p.status === "PUBLISHED";

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
              ? { label: "Voir les publications", href: "/exports" }
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
  };
}

function loadProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 9,
    select: {
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
      scripts: { orderBy: { version: "desc" }, take: 3, select: { id: true, wordCount: true, estimatedDurationSec: true, viralityScore: true, hookScore: true, retentionScore: true, clarityScore: true, scoreRationale: true } },
      voiceovers: { where: { status: "READY" }, orderBy: { createdAt: "desc" }, take: 3, select: { scriptId: true, durationMs: true } },
      renderJobs: { orderBy: { createdAt: "desc" }, take: 4, select: { status: true, progress: true, outputUrl: true, thumbnailUrl: true } },
    },
  });
}

export async function getDashboard() {
  const [user, workspace] = await Promise.all([getCurrentUser(), getCurrentWorkspace()]);
  const plan = effectivePlanDef(user);
  const admin = isAdmin(user.role);

  const [rows, totals, usage, scheduled, autopilot, autopilotFailed, scoreStats, bestScript] = await Promise.all([
    loadProjects(user.id),
    prisma.$transaction([
      prisma.project.count({ where: { userId: user.id } }),
      prisma.script.count({ where: { userId: user.id } }),
      prisma.renderJob.count({ where: { userId: user.id, status: "COMPLETED" } }),
      prisma.publishJob.count({ where: { userId: user.id, status: "PUBLISHED" } }),
    ]),
    getUsageSummary(user.id),
    prisma.publishJob.findMany({
      where: { userId: user.id, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
      take: 4,
      select: { id: true, scheduledAt: true, project: { select: { title: true } }, socialAccount: { select: { username: true, platform: true } } },
    }),
    plan.autopilotQueue > 0
      ? prisma.autopilotItem.findMany({
          where: { userId: user.id, status: { in: ["SCHEDULED", "SCRIPTING", "VOICING", "VISUALS", "RENDERING", "READY"] } },
          orderBy: { deliverAt: "asc" },
          take: 4,
          select: { id: true, topic: true, deliverAt: true, status: true, project: { select: { title: true } } },
        })
      : Promise.resolve([]),
    plan.autopilotQueue > 0 ? prisma.autopilotItem.count({ where: { userId: user.id, status: "FAILED" } }) : Promise.resolve(0),
    prisma.script.aggregate({ where: { userId: user.id, viralityScore: { gt: 0 } }, _avg: { viralityScore: true }, _count: { _all: true } }),
    prisma.script.findFirst({ where: { userId: user.id, viralityScore: { gt: 0 } }, orderBy: { viralityScore: "desc" }, select: { viralityScore: true, title: true, projectId: true } }),
  ]);

  const projects = rows.map(buildProject);
  // The project to pick up: the most recent one not finished yet, else simply the most recent.
  const featured = projects.find((p) => p.status !== "PUBLISHED" && !p.steps.every((s) => s.state === "done")) ?? projects[0] ?? null;
  const recent = projects.filter((p) => p.id !== featured?.id).slice(0, 8);

  const AUTOPILOT_LABEL: Record<string, string> = { SCHEDULED: "Programmée", SCRIPTING: "Script en cours", VOICING: "Voix en cours", VISUALS: "Visuels en cours", RENDERING: "Rendu en cours", READY: "Prête" };
  const agenda: AgendaEntry[] = [
    ...scheduled.map((s) => ({ id: s.id, kind: "post" as const, title: s.project.title, at: s.scheduledAt, detail: `@${s.socialAccount.username}`, platform: s.socialAccount.platform, href: "/exports" })),
    ...autopilot.map((a) => ({ id: a.id, kind: "autopilot" as const, title: a.project?.title ?? a.topic, at: a.deliverAt, detail: `Pilote automatique · ${AUTOPILOT_LABEL[a.status] ?? a.status}`, href: `/autopilot?item=${a.id}` })),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 5);

  const scriptCost = admin ? 0 : CREDIT_COSTS.SCRIPT_GENERATION;
  const videoCost = CREDIT_COSTS.SCRIPT_GENERATION + CREDIT_COSTS.VOICEOVER_PER_30S * 2 + CREDIT_COSTS.RENDER_1080P;
  const carouselSource = projects.find((p) => p.hasScript) ?? null;

  return {
    user: { firstName: (user.name ?? "").trim().split(/\s+/)[0] || null, credits: user.credits, admin },
    workspace: { name: workspace.name, language: workspace.defaultLanguage },
    plan: { name: plan.name, monthlyCredits: plan.monthlyCredits, autopilot: plan.autopilotQueue > 0, voiceCloning: plan.voiceCloning },
    totals: { projects: totals[0], scripts: totals[1], renders: totals[2], published: totals[3] },
    usage,
    credits: { scriptCost, videosLeft: Math.floor(user.credits / videoCost), low: !admin && user.credits < 12 },
    ai: integrations.ai(),
    featured,
    recent,
    agenda,
    autopilotFailed,
    autopilotQueued: autopilot.length,
    scores: scoreStats._count._all > 0 ? { average: Math.round(scoreStats._avg.viralityScore ?? 0), count: scoreStats._count._all, best: bestScript } : null,
    carouselSource: carouselSource ? { id: carouselSource.id, title: carouselSource.title } : null,
    posters: projects.slice(0, 3).map((p) => ({ id: p.id, title: p.title, thumbnailUrl: p.thumbnailUrl })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
