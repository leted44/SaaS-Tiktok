import { cache } from "react";
import { readClone } from "@/lib/ai/clone";
import type { CloneView } from "@/components/spaces/clone-block";
import { carouselLookSummary, readSpaceKit, videoLookSummary } from "@/lib/space-kit";
import { getTrack } from "@/lib/music/library";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PLANS, effectivePlanDef, isAdmin, CREDIT_COSTS } from "@/lib/plans";
import { integrations } from "@/lib/env";
import type { SpaceOption } from "@/lib/spaces";
import { VOICES, sortVoices } from "@/lib/tts/voices";
import { CUSTOM_VOICE_ID, customVoiceDefinition } from "@/lib/tts/resolve-voice";
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
      space: { select: { name: true, characterImage: true, kit: true, voiceId: true } },
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
    include: { workspace: true, space: { select: { name: true, characterImage: true, kit: true, voiceId: true } }, scripts: { orderBy: { version: "desc" } }, carousel: true },
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

/**
 * The user's spaces with what their cards and editor need: settings, project
 * and published counts, the voices the editor offers, and what drawing a
 * character sheet costs this account.
 */
/** A space's saved look (lib/space-kit) as its card shows it. */
export interface SpaceLookView {
  video: { summary: string[]; savedAt: string; projectId: string | null } | null;
  carousel: { summary: string[]; savedAt: string; projectId: string | null } | null;
}

function spaceLookView(value: unknown): SpaceLookView {
  const kit = readSpaceKit(value);
  return {
    video: kit.video ? { summary: videoLookSummary(kit.video, kit.video.musicName ?? getTrack(kit.video.musicTrackId)?.name ?? null), savedAt: kit.video.savedAt, projectId: kit.video.fromProjectId } : null,
    carousel: kit.carousel ? { summary: carouselLookSummary(kit.carousel), savedAt: kit.carousel.savedAt, projectId: kit.carousel.fromProjectId } : null,
  };
}

/** The space's clone (lib/ai/clone) as its card shows it: no fal URLs. */
function cloneView(value: unknown): CloneView | null {
  const c = readClone(value);
  return c ? { status: c.status, photos: c.photos, photoUrl: c.photoUrl, error: c.error, startedAt: c.startedAt, readyAt: c.readyAt, trigger: c.trigger, backedUp: Boolean(c.loraBackupUrl) } : null;
}

export async function getSpacesData() {
  const [user, workspace] = await Promise.all([getCurrentUser(), getCurrentWorkspace()]);
  const plan = effectivePlanDef(user);
  const [rows, published, customVoice] = await Promise.all([
    prisma.space.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, color: true, language: true, tone: true, voiceId: true, brief: true, characterImage: true, kit: true, clone: true, _count: { select: { projects: true } } } }),
    prisma.project.groupBy({ by: ["spaceId"], where: { userId: user.id, postedAt: { not: null }, spaceId: { not: null } }, _count: { _all: true } }),
    plan.voiceCloning ? prisma.customVoice.findUnique({ where: { userId: user.id }, select: { name: true } }) : null,
  ]);
  const publishedBySpace = new Map(published.map((p) => [p.spaceId, p._count._all]));
  const spaces: (SpaceOption & { publishedCount: number; look: SpaceLookView; clone: CloneView | null })[] = rows.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    language: s.language,
    tone: s.tone,
    voiceId: s.voiceId,
    brief: s.brief,
    characterImage: s.characterImage,
    projectCount: s._count.projects,
    publishedCount: publishedBySpace.get(s.id) ?? 0,
    look: spaceLookView(s.kit),
    clone: cloneView(s.clone),
  }));
  const voices = [
    ...(customVoice ? [customVoiceDefinition(customVoice.name)] : []),
    ...sortVoices(VOICES, workspace.defaultLanguage, plan.premiumVoices),
  ].map((v) => ({ id: v.id, name: v.id === CUSTOM_VOICE_ID ? `${v.name} (ta voix)` : v.name }));
  return { user, admin: isAdmin(user.role), spaces, voices, sheetGeneration: { cost: isAdmin(user.role) ? 0 : CREDIT_COSTS.AI_IMAGE, enabled: integrations.aiImages() } };
}
