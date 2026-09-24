import { prisma } from "@/lib/prisma";
import { getCurrentUser, getCurrentWorkspace } from "@/server/queries";
import { getUsageSummary } from "@/lib/credits";
import { CREDIT_COSTS, effectivePlanDef, isAdmin } from "@/lib/plans";
import { integrations } from "@/lib/env";
import { PROJECT_PROGRESS_SELECT, buildProjectProgress } from "@/lib/projects/progress";

export type { StepKey, StepState, WorkflowStep, ProjectCardData } from "@/lib/projects/progress";

/**
 * Everything the dashboard shows, read from the data the rest of the app
 * already writes — nothing here is estimated or made up. A project's
 * workflow is worked out from what exists for it: a script, a voice-over,
 * visuals, a finished render.
 */

export interface AgendaEntry {
  id: string;
  kind: "post" | "autopilot";
  title: string;
  at: Date;
  detail: string;
  platform?: "TIKTOK" | "INSTAGRAM" | "YOUTUBE";
  href: string;
}

function loadProjects(userId: string) {
  return prisma.project.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 9, select: PROJECT_PROGRESS_SELECT });
}

/** "BENJAMIN" or "benjamin dupont" → "Benjamin". */
function displayName(name: string | null): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toLocaleUpperCase("fr") + first.slice(1).toLocaleLowerCase("fr");
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
      // Videos posted: marked by hand, or published through a connected account.
      prisma.project.count({ where: { userId: user.id, OR: [{ postedAt: { not: null } }, { status: "PUBLISHED" }, { publishJobs: { some: { status: "PUBLISHED" } } }] } }),
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

  const projects = rows.map(buildProjectProgress);
  // The project to pick up: the most recent one not finished yet, else simply the most recent.
  const featured = projects.find((p) => p.stage === "todo") ?? projects.find((p) => p.stage === "ready") ?? projects[0] ?? null;
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
    user: { firstName: displayName(user.name), credits: user.credits, admin },
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
