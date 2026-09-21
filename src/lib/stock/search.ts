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

/**
 * Top candidates for one scene, searching both catalogs and falling back to
 * the other media type when the preferred one comes up thin. Several are
 * returned so the caller can skip a clip it already used on a neighbouring
 * scene. A dead query yields an empty list rather than failing the whole batch.
 */
export async function stockCandidates(query: string, prefer: "video" | "image" = "video", limit = 3): Promise<StockResult[]> {
  const dedupe = (lists: StockResult[][]) => {
    const seen = new Set<string>();
    return lists.flat().filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, limit);
  };

  try {
    const portrait = await searchStock(query, prefer, limit, true);
    if (portrait.length >= 3) return dedupe([portrait]);

    // Both catalogs carry far less portrait footage than landscape, and a thin
    // portrait result set is where off-topic matches come from. Widening the
    // orientation keeps the subject right; `cover` crops the frame.
    const wide = await searchStock(query, prefer, limit, false);
    const merged = dedupe([portrait, wide]);
    if (merged.length) return merged;

    return dedupe([await searchStock(query, prefer === "video" ? "image" : "video", limit, false)]);
  } catch (err) {
    if (err instanceof StockError && err.code === "NOT_CONFIGURED") throw err;
    return [];
  }
}
