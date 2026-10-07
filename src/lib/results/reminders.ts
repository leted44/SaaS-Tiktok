import { prisma } from "@/lib/prisma";
import { RESULTS_ENABLED } from "@/lib/results/config";
import { sendPush } from "@/lib/push";

/**
 * Two days after a post goes out, its numbers have mostly settled — a post
 * lives about 48 hours in the feed. The creator is reminded once to give its
 * results, during the day only (a 3 a.m. notification gets a post forgotten
 * rather than measured). Posts older than a week are left alone.
 */
const SETTLED_MS = 48 * 3600_000;
const TOO_OLD_MS = 7 * 24 * 3600_000;

function parisHour(at: Date): number {
  return Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(at));
}

export async function remindResults(now = new Date()): Promise<number> {
  if (!RESULTS_ENABLED) return 0;
  const hour = parisHour(now);
  if (hour < 9 || hour >= 21) return 0;
  const due = await prisma.project.findMany({
    where: {
      postedAt: { lte: new Date(now.getTime() - SETTLED_MS), gte: new Date(now.getTime() - TOO_OLD_MS) },
      resultsReminderAt: null,
      results: { none: {} },
    },
    select: { id: true, userId: true, title: true, carousel: { select: { id: true } } },
    take: 20,
  });
  let sent = 0;
  for (const p of due) {
    // Claimed first: a second worker tick running at the same moment skips it.
    const { count } = await prisma.project.updateMany({ where: { id: p.id, resultsReminderAt: null }, data: { resultsReminderAt: now } });
    if (!count) continue;
    await sendPush(p.userId, {
      title: "Tes résultats sont prêts",
      body: `Ajoute les statistiques de « ${p.title.slice(0, 60)} » : VidiSprint en tirera des leçons pour tes prochaines publications.`,
      url: p.carousel ? `/studio/${p.id}/carousel` : `/studio/${p.id}`,
      tag: `results-${p.id}`,
    }).catch((err) => console.error("[results] reminder push failed:", err));
    sent++;
  }
  return sent;
}
