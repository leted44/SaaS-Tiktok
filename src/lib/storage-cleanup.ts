import { prisma } from "@/lib/prisma";
import { deleteObjects, listStoredObjects } from "@/lib/storage";
import { ident, textColumns } from "@/lib/storage-migration";

/**
 * Removing stored files nothing uses any more.
 *
 * Every file is written under `<kind>/<userId>/<file>` (lib/storage
 * storageKey), and a file is in use exactly when that key appears somewhere
 * in the database — in a plain column (an asset's url, a voice-over's audio)
 * or inside a JSON document (a carousel's slides, a project's visual layers).
 * So the database is scanned whole, every text and JSON column, for keys: a
 * column added later counts as a reference automatically, and the mistake
 * this can make is keeping a file too long, never deleting one in use.
 *
 * Only a few columns are records of the past rather than uses, and do not
 * keep a file alive: a render's snapshot of the props it was made from, its
 * logs, and the clip a Kling job produced (the clip in use is referenced by
 * the project's visual layers).
 */

const KEY_PATTERN = "(?:audio|video|thumb|asset)/[A-Za-z0-9]+/[A-Za-z0-9._-]+";
const KEY = new RegExp(`^${KEY_PATTERN}$`);
const NOT_A_USE = new Set(["RenderJob.inputProps", "RenderJob.logs", "VideoClipJob.resultUrl"]);

/** How long an unreferenced file is kept: covers work in flight (a clip stored before its layer is saved) and second thoughts. */
export const CLEANUP_GRACE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** Every storage key the database still uses — only the given user's, when one is given. */
export async function referencedKeys(userId?: string): Promise<Set<string>> {
  if (userId !== undefined && !/^[A-Za-z0-9]+$/.test(userId)) throw new Error("invalid user id");
  const columns = (await textColumns()).filter((c) => !NOT_A_USE.has(`${c.table}.${c.column}`));
  if (columns.length === 0) return new Set();
  const pattern = userId ? `((?:audio|video|thumb|asset)/${userId}/[A-Za-z0-9._-]+)` : `(${KEY_PATTERN})`;
  // One statement for the whole schema: a query per column meant over a hundred round trips to the database.
  const sql = columns
    .map((c) => {
      const col = `${ident(c.column)}::text`;
      return `SELECT (regexp_matches(${col}, $1, 'g'))[1] AS key FROM ${ident(c.table)} WHERE strpos(${col}, $2) > 0`;
    })
    .join(" UNION ");
  const rows = await prisma.$queryRawUnsafe<{ key: string }[]>(sql, pattern, userId ? `/${userId}/` : "/");
  return new Set(rows.map((r) => r.key));
}

/** The storage keys a value holds, belonging to one user. */
export function keysIn(value: unknown, userId: string): string[] {
  const text = JSON.stringify(value) ?? "";
  const re = new RegExp(`(?:audio|video|thumb|asset)/${userId}/[A-Za-z0-9._-]+`, "g");
  return [...new Set(text.match(re) ?? [])];
}

/**
 * Delete the given files of a user that nothing in the database uses any
 * more — called right after a project is deleted, with the keys it held, so
 * its files go with it without waiting for the daily cleanup. A file the
 * project shared with another one, or with the user's library, stays.
 */
export async function deleteUnusedKeys(userId: string, keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const used = await referencedKeys(userId);
  const unused = keys.filter((k) => KEY.test(k) && !used.has(k));
  await deleteObjects(unused);
  return unused.length;
}

export interface CleanupReport {
  /** Completed renders replaced by a newer one of the same project. */
  oldRenders: number;
  files: number;
  bytes: number;
  unusedFiles: number;
  unusedBytes: number;
  deletedFiles: number;
  deletedBytes: number;
  /** Set when the run stopped before deleting anything, and why. */
  held: string | null;
  /** False when the time budget ran out — run it again to finish. */
  complete: boolean;
}

/**
 * Renders that a newer completed render of the same project replaced, at
 * least `CLEANUP_GRACE_DAYS` ago. A render that was published or that
 * autopilot points to is kept, and so is one stored outside our bucket (a
 * Lambda render), whose file deleting the row would not remove.
 */
async function supersededRenders(cutoff: Date): Promise<{ id: string }[]> {
  const latest = await prisma.renderJob.groupBy({ by: ["projectId"], where: { status: "COMPLETED" }, _max: { completedAt: true } });
  const newest = new Map(latest.map((l) => [l.projectId, l._max.completedAt]));
  const old = await prisma.renderJob.findMany({
    where: { status: "COMPLETED", completedAt: { lt: cutoff }, publishJobs: { none: {} } },
    select: { id: true, projectId: true, completedAt: true, outputUrl: true },
  });
  const pinned = new Set(
    (await prisma.autopilotItem.findMany({ where: { renderJobId: { in: old.map((r) => r.id) } }, select: { renderJobId: true } })).map((a) => a.renderJobId),
  );
  return old.filter((r) => {
    const top = newest.get(r.projectId);
    return top && r.completedAt && r.completedAt < top && !pinned.has(r.id) && new RegExp(`video/[A-Za-z0-9]+/`).test(r.outputUrl ?? "");
  });
}

/**
 * The storage cleanup. Removes the renders a newer one replaced, then every
 * file nothing references that is older than the grace period.
 *
 * `dryRun` only counts. Unless `force`, a run that would delete more than half
 * of all files holds back and deletes nothing: that is what a broken scan
 * would look like, and it is cheaper to have an admin confirm it once from
 * /admin/storage than to lose files.
 */
export async function cleanStorage({ dryRun = false, force = false, budgetMs = 45_000, graceDays = CLEANUP_GRACE_DAYS }: { dryRun?: boolean; force?: boolean; budgetMs?: number; graceDays?: number } = {}): Promise<CleanupReport> {
  const deadline = Date.now() + budgetMs;
  const cutoff = new Date(Date.now() - graceDays * DAY);
  const report: CleanupReport = { oldRenders: 0, files: 0, bytes: 0, unusedFiles: 0, unusedBytes: 0, deletedFiles: 0, deletedBytes: 0, held: null, complete: true };

  const renders = await supersededRenders(cutoff);
  report.oldRenders = renders.length;
  if (!dryRun && renders.length > 0) await prisma.renderJob.deleteMany({ where: { id: { in: renders.map((r) => r.id) } } });

  const used = await referencedKeys();
  // An empty answer from a database that holds projects is a failed scan, not an empty account.
  if (used.size === 0 && (await prisma.project.count()) > 0) throw new Error("storage cleanup: the reference scan found nothing — aborted");

  const unused: { key: string; sizeBytes: number }[] = [];
  for await (const o of listStoredObjects()) {
    report.files++;
    report.bytes += o.sizeBytes;
    if (KEY.test(o.key) && !used.has(o.key) && o.lastModified < cutoff) unused.push(o);
  }
  report.unusedFiles = unused.length;
  report.unusedBytes = unused.reduce((sum, o) => sum + o.sizeBytes, 0);
  if (dryRun || unused.length === 0) return report;

  if (!force && unused.length > 50 && unused.length > report.files / 2) {
    report.held = `would delete ${unused.length} of ${report.files} files — confirm from /admin/storage`;
    return report;
  }

  for (let i = 0; i < unused.length; i += 200) {
    if (Date.now() > deadline) {
      report.complete = false;
      break;
    }
    const batch = unused.slice(i, i + 200);
    await deleteObjects(batch.map((o) => o.key));
    report.deletedFiles += batch.length;
    report.deletedBytes += batch.reduce((sum, o) => sum + o.sizeBytes, 0);
  }
  return report;
}

/** Run the cleanup at most once a day, from the worker tick — whichever tick claims the day runs it. */
export async function maybeCleanStorage(): Promise<CleanupReport | null> {
  const id = "storage-cleanup";
  await prisma.workerHeartbeat.createMany({ data: [{ id, tickAt: new Date(0) }], skipDuplicates: true });
  const claimed = await prisma.workerHeartbeat.updateMany({ where: { id, tickAt: { lt: new Date(Date.now() - DAY) } }, data: { tickAt: new Date() } });
  if (claimed.count === 0) return null;
  const started = Date.now();
  try {
    const report = await cleanStorage({ budgetMs: 60_000 });
    await prisma.workerHeartbeat.update({ where: { id }, data: { durationMs: Date.now() - started, error: report.held } });
    console.log("[storage-cleanup]", JSON.stringify(report));
    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.workerHeartbeat.update({ where: { id }, data: { durationMs: Date.now() - started, error: message } }).catch(() => undefined);
    throw err;
  }
}
