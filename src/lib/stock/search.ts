import { searchStock as searchPexels, StockError, type StockResult } from "@/lib/stock/pexels";
import { searchPixabay } from "@/lib/stock/pixabay";
import { env } from "@/lib/env";

export { StockError, type StockResult } from "@/lib/stock/pexels";

/**
 * Both catalogs, merged. Pexels alone comes up empty or generic on a specific,
 * narrow subject — a named gymnastics move, a niche craft — often enough that
 * one library isn't sufficient; Pixabay is curated independently and tends to
 * fill exactly those gaps rather than return the same clips again.
 *
 * Pixabay is optional (no PIXABAY_API_KEY: stock search still works, Pexels
 * alone, exactly as before) and never allowed to break a search Pexels can
 * still answer — a Pixabay-side failure is swallowed, not surfaced.
 */
export async function searchStock(query: string, type: "video" | "image", limit = 8, portraitOnly = true): Promise<StockResult[]> {
  const [pexels, pixabay] = await Promise.allSettled([
    searchPexels(query, type, limit, portraitOnly),
    env.pixabayApiKey ? searchPixabay(query, type, limit, portraitOnly) : Promise.resolve<StockResult[]>([]),
  ]);

  // Not configured is the one Pexels failure a caller needs to see. Any other
  // Pexels error is swallowed below as long as Pixabay still found something.
  if (pexels.status === "rejected" && pexels.reason instanceof StockError && pexels.reason.code === "NOT_CONFIGURED") {
    throw pexels.reason;
  }

  const results = [
    ...(pexels.status === "fulfilled" ? pexels.value : []),
    ...(pixabay.status === "fulfilled" ? pixabay.value : []),
  ];
  if (!results.length && pexels.status === "rejected") throw pexels.reason;
  return results;
}

function dedupe(lists: StockResult[][], limit: number): StockResult[] {
  const seen = new Set<string>();
  return lists.flat().filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, limit);
}

/**
 * A search that widens itself instead of returning what a first, narrow pass
 * found — the behaviour a person browsing manually expects (try harder before
 * giving up), as opposed to `stockCandidates` below, which is tuned for
 * unattended auto-fill and stops widening sooner. Kept as its own function
 * because the two callers disagree on when "good enough" is reached, not
 * because the widening logic itself differs.
 */
export async function browseStock(query: string, type: "video" | "image", limit = 16): Promise<StockResult[]> {
  const portrait = await searchStock(query, type, limit, true);
  if (portrait.length >= 6) return dedupe([portrait], limit);

  // Both catalogs carry far less portrait footage than landscape, and a thin
  // portrait result set is where off-topic matches come from. Widening the
  // orientation keeps the subject right; `cover` crops the frame. Media type
  // is left alone here — a person who picked "video" typed a query expecting
  // video back, unlike auto-fill, which just needs any usable visual.
  const wide = await searchStock(query, type, limit, false);
  return dedupe([portrait, wide], limit);
}

/** Pexels caps per_page at 80; beyond this a query has nothing relevant left anyway. */
const MAX_FETCH = 60;

/**
 * Top candidates for one scene, searching both catalogs and falling back to
 * the other media type when the preferred one comes up thin. Several are
 * returned so the caller can skip a clip it already used on a neighbouring
 * scene. A dead query yields an empty list rather than failing the whole batch.
 *
 * `exclude` holds the URLs the project has already shown. Each catalog returns
 * the same results in the same order for the same query, so without it a
 * rejected clip is simply the first hit again; with it, every pass fetches
 * deep enough to get past what was already seen before judging it thin.
 */
export async function stockCandidates(query: string, prefer: "video" | "image" = "video", limit = 3, exclude: ReadonlySet<string> = new Set()): Promise<StockResult[]> {
  const fetchSize = Math.min(MAX_FETCH, limit + exclude.size);
  const fresh = (list: StockResult[]) => list.filter((r) => !exclude.has(r.url));
  try {
    const portrait = fresh(await searchStock(query, prefer, fetchSize, true));
    if (portrait.length >= 3) return dedupe([portrait], limit);

    const wide = fresh(await searchStock(query, prefer, fetchSize, false));
    const merged = dedupe([portrait, wide], limit);
    if (merged.length >= 3 || (merged.length && !exclude.size)) return merged;

    const other = fresh(await searchStock(query, prefer === "video" ? "image" : "video", fetchSize, false));
    return dedupe([merged, other], limit);
  } catch (err) {
    if (err instanceof StockError && err.code === "NOT_CONFIGURED") throw err;
    return [];
  }
}
