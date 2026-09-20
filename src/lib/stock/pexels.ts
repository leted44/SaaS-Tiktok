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
 * Pick the smallest mp4 rendition at least as tall as the target, so Lambda
 * downloads the least data that still fills a 9:16 frame without upscaling.
 */
function pickVideoFile(files: PexelsVideoFile[], minHeight: number): PexelsVideoFile | null {
  const mp4 = files.filter((f) => f.file_type === "video/mp4" && f.link);
  if (!mp4.length) return null;
  const sorted = [...mp4].sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
  return sorted.find((f) => (f.height ?? 0) >= minHeight) ?? sorted[sorted.length - 1];
}

async function pexels<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!env.pexelsApiKey) throw new StockError("La banque d'images n'est pas configurée (clé PEXELS_API_KEY manquante).", "NOT_CONFIGURED");
  const url = new URL(`https://api.pexels.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Authorization: env.pexelsApiKey }, cache: "no-store" });
  if (!res.ok) throw new StockError(`Pexels a répondu ${res.status} : ${(await res.text()).slice(0, 200)}`, "UPSTREAM");
  return (await res.json()) as T;
}

/**
 * Search royalty-free stock media for a scene. Portrait orientation only —
 * the compositions are 9:16, so landscape assets would be cropped to a sliver.
 */
export async function searchStock(query: string, type: "video" | "image", limit = 8, minHeight = 1280): Promise<StockResult[]> {
  const params = { query, orientation: "portrait", per_page: String(limit) };

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
    const file = pickVideoFile(v.video_files, minHeight);
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
  try {
    const primary = await searchStock(query, prefer, limit);
    if (primary.length) return primary;
    return await searchStock(query, prefer === "video" ? "image" : "video", limit);
  } catch (err) {
    if (err instanceof StockError && err.code === "NOT_CONFIGURED") throw err;
    return [];
  }
}
