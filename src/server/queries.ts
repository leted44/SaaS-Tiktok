import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { getUsageSummary } from "@/lib/credits";
import { reviewReportSchema, reviewTally, type ReviewReport, type ReviewTally } from "@/lib/ai/review-report";

export const getCurrentUser = cache(async () => {
  const session = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
  return user;
});

export const getCustomVoice = cache(async (userId: string) => {
  return prisma.customVoice.findUnique({ where: { userId } });
});

export const getCurrentWorkspace = cache(async () => {
  const user = await getCurrentUser();
  let workspace = await prisma.workspace.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
  if (!workspace) {
    workspace = await prisma.workspace.create({ data: { ownerId: user.id, name: "My Studio", slug: `studio-${user.id.slice(-8)}` } });
  }
  return workspace;
});

export async function getDashboardData() {
  const user = await getCurrentUser();
  const workspace = await getCurrentWorkspace();
  const [projects, renders, usage, totals, scheduled] = await Promise.all([
    prisma.project.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 6, include: { scripts: { orderBy: { version: "desc" }, take: 1, select: { viralityScore: true } } } }),
    prisma.renderJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5, include: { project: { select: { title: true } } } }),
    getUsageSummary(user.id),
    prisma.$transaction([
      prisma.project.count({ where: { userId: user.id } }),
      prisma.renderJob.count({ where: { userId: user.id, status: "COMPLETED" } }),
      prisma.publishJob.count({ where: { userId: user.id, status: "PUBLISHED" } }),
      prisma.script.count({ where: { userId: user.id } }),
    ]),
    prisma.publishJob.findMany({ where: { userId: user.id, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, take: 4, include: { project: { select: { title: true } }, socialAccount: { select: { username: true, platform: true } } } }),
  ]);
  const plan = PLANS[user.plan];
  return { user, workspace, projects, renders, usage, scheduled, plan, totals: { projects: totals[0], renders: totals[1], published: totals[2], scripts: totals[3] } };
}

export async function getProjectForStudio(projectId: string) {
  const user = await getCurrentUser();
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: {
      workspace: true,
      space: { select: { name: true, characterImage: true } },
      scripts: { orderBy: { version: "desc" } },
      voiceovers: { orderBy: { createdAt: "desc" }, take: 5 },
      renderJobs: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!project) return null;
  const activeScript = project.scripts.find((s) => s.id === project.activeScriptId) ?? project.scripts[0] ?? null;
  const activeVoiceover = activeScript ? project.voiceovers.find((v) => v.scriptId === activeScript.id && v.status === "READY") ?? null : null;
  return { project, user, activeScript, activeVoiceover };
}

/** Everything the carousel editor needs: the project, its active script, its brand and the carousel itself. */
export async function getProjectForCarousel(projectId: string) {
  const user = await getCurrentUser();
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { workspace: true, space: { select: { name: true, characterImage: true } }, scripts: { orderBy: { version: "desc" } }, carousel: true },
  });
  if (!project) return null;
  const activeScript = project.scripts.find((s) => s.id === project.activeScriptId) ?? project.scripts[0] ?? null;
  return { project, user, activeScript };
}

/** The stored critic report of a script, or null on scripts written before it existed. */
export function readReviewReport(value: unknown): ReviewReport | null {
  const parsed = reviewReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** How the critic pass did on the account's 10 latest scripts of one format. */
export async function getReviewTally(userId: string, format: "video" | "carousel"): Promise<ReviewTally> {
  const rows = await prisma.script.findMany({
    where: { userId, carouselLength: format === "carousel" ? { not: null } : null, NOT: { reviewReport: { equals: Prisma.AnyNull } } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { reviewReport: true },
  });
  return reviewTally(rows.map((r) => readReviewReport(r.reviewReport)).filter((r): r is ReviewReport => r !== null));
}

export async function getExportsData() {
  const user = await getCurrentUser();
  const workspace = await getCurrentWorkspace();
  const [renders, publishJobs, socialAccounts] = await Promise.all([
    prisma.renderJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50, include: { project: { select: { id: true, title: true, aspectRatio: true } }, publishJobs: { include: { socialAccount: { select: { username: true, platform: true } } } } } }),
    prisma.publishJob.findMany({ where: { userId: user.id }, orderBy: { scheduledAt: "desc" }, take: 50, include: { project: { select: { title: true } }, socialAccount: { select: { username: true, platform: true, avatarUrl: true } }, renderJob: { select: { thumbnailUrl: true } } } }),
    prisma.socialAccount.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" } }),
  ]);
  return { user, workspace, renders, publishJobs, socialAccounts };
}

export async function getBillingData() {
  const user = await getCurrentUser();
  const [transactions, usage] = await Promise.all([
    prisma.creditTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 40 }),
    getUsageSummary(user.id),
  ]);
  return { user, transactions, usage, plan: PLANS[user.plan] };
}

export async function getScriptsLibrary() {
  const user = await getCurrentUser();
  return prisma.script.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60, include: { project: { select: { id: true, title: true, status: true } } } });
}
