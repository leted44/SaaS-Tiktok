import { env } from "@/lib/env";

export interface StockResult {
  id: string;
  type: "image" | "video";
  /** Direct media URL — fetched as-is by the Remotion renderer. */
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  durationSec: number | null;
  author: string;
  sourceUrl: string;
}

export class StockError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "UPSTREAM") {
    super(message);
  }
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  src: { large2x: string; large: string; portrait: string; medium: string; tiny: string };
}

interface PexelsVideoFile {
  id: number;
  quality: string | null;
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  user: { name: string };
  video_files: PexelsVideoFile[];
}

/**
 * Pick the smallest mp4 rendition tall enough to fill a 9:16 frame, but never a
 * 4K one.
 *
 * The ceiling is the point: Pexels lists landscape clips at 1280/1440/2160, and
 * "smallest at least 1280 tall" alone is satisfied by 1280 for portrait footage
 * but forces UHD for landscape footage, whose height is the long side. Every
 * frame of that UHD clip then has to be decoded on a Lambda's single vCPU to
 * produce one 1080-wide frame — eight times the pixels of the output, thrown
 * away immediately by the `cover` crop.
 */
function pickVideoFile(files: PexelsVideoFile[], minHeight: number, maxHeight: number): PexelsVideoFile | null {
  const mp4 = files.filter((f) => f.file_type === "video/mp4" && f.link);
  if (!mp4.length) return null;
  const sorted = [...mp4].sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
  const inRange = sorted.filter((f) => (f.height ?? 0) >= minHeight && (f.height ?? 0) <= maxHeight);
  if (inRange.length) return inRange[0];
  // Nothing in the window: prefer the largest rendition under the ceiling over
  // an oversized one, and only fall back upwards when there is nothing below.
  const under = sorted.filter((f) => (f.height ?? 0) <= maxHeight);
  return under.length ? under[under.length - 1] : sorted[0];
}

async function pexels<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!env.pexelsApiKey) throw new StockError("La banque d'images n'est pas configurée (clé PEXELS_API_KEY manquante).", "NOT_CONFIGURED");
  const url = new URL(`https://api.pexels.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Authorization: env.pexelsApiKey }, cache: "no-store" });
  if (!res.ok) throw new StockError(`Pexels a répondu ${res.status} : ${(await res.text()).slice(0, 200)}`, "UPSTREAM");
  return (await res.json()) as T;
}

/** Smallest rendition that still fills a 1080×1920 frame without upscaling. */
const TARGET_HEIGHT = 1280;

/** Hard ceiling on the source: renders output at most 2160 tall, and decoding a
 * UHD source frame by frame is the single most expensive thing a render does. */
const MAX_SOURCE_HEIGHT = 1920;

/** Below this many portrait hits, the vertical pool is too thin to be relevant. */
const MIN_PORTRAIT_RESULTS = 3;

/**
 * Search royalty-free stock media for a scene. Portrait is preferred because the
 * compositions are 9:16, but it can be relaxed — landscape assets get cropped by
 * the `cover` fit rather than dropped.
 */
export async function searchStock(query: string, type: "video" | "image", limit = 8, portraitOnly = true): Promise<StockResult[]> {
  const params: Record<string, string> = { query, per_page: String(limit) };
  if (portraitOnly) params.orientation = "portrait";

  if (type === "image") {
    const data = await pexels<{ photos: PexelsPhoto[] }>("/v1/search", params);
    return data.photos.map((p) => ({
      id: `pexels-photo-${p.id}`,
      type: "image" as const,
      url: p.src.portrait || p.src.large2x || p.src.large,
      thumbnailUrl: p.src.tiny,
      width: p.width,
      height: p.height,
      durationSec: null,
      author: p.photographer,
      sourceUrl: p.url,
    }));
  }

  const data = await pexels<{ videos: PexelsVideo[] }>("/videos/search", params);
  return data.videos.flatMap((v) => {
    const file = pickVideoFile(v.video_files, TARGET_HEIGHT, MAX_SOURCE_HEIGHT);
    if (!file) return [];
    return [{
      id: `pexels-video-${v.id}`,
      type: "video" as const,
      url: file.link,
      thumbnailUrl: v.image,
      width: file.width ?? v.width,
      height: file.height ?? v.height,
      durationSec: v.duration,
      author: v.user.name,
      sourceUrl: v.url,
    }];
  });
}

/**
 * Top candidates for one scene, falling back to the other media type when the
 * preferred one has no portrait results. Several are returned so the caller can
 * skip a clip it already used on a neighbouring scene. A dead query yields an
 * empty list rather than failing the whole batch.
 */
export async function stockCandidates(query: string, prefer: "video" | "image" = "video", limit = 3): Promise<StockResult[]> {
  const dedupe = (lists: StockResult[][]) => {
    const seen = new Set<string>();
    return lists.flat().filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, limit);
  };

  try {
    const portrait = await searchStock(query, prefer, limit);
    if (portrait.length >= MIN_PORTRAIT_RESULTS) return portrait;

    // Pexels carries far less portrait footage than landscape, and a thin
    // portrait result set is where off-topic matches come from. Widening the
    // orientation keeps the subject right; `cover` crops the frame.
    const wide = await searchStock(query, prefer, limit, false);
    const merged = dedupe([portrait, wide]);
    if (merged.length) return merged;

    return await searchStock(query, prefer === "video" ? "image" : "video", limit, false);
  } catch (err) {
    if (err instanceof StockError && err.code === "NOT_CONFIGURED") throw err;
    return [];
  }
}
