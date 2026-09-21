import { env } from "@/lib/env";
import { StockError, type StockResult } from "@/lib/stock/pexels";

interface PixabayImageHit {
  id: number;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  pageURL: string;
}

interface PixabayVideoRendition {
  url: string;
  width: number;
  height: number;
}

interface PixabayVideoHit {
  id: number;
  duration: number;
  picture_id: string;
  user: string;
  pageURL: string;
  videos: { large: PixabayVideoRendition; medium: PixabayVideoRendition; small: PixabayVideoRendition; tiny: PixabayVideoRendition };
}

/** Same window Pexels' provider targets, so a clip from either source costs the same to render. */
const TARGET_HEIGHT = 1280;
const MAX_SOURCE_HEIGHT = 1920;

function pickVideoRendition(v: PixabayVideoHit["videos"]): PixabayVideoRendition | null {
  const renditions = [v.large, v.medium, v.small, v.tiny].filter((r) => r?.url && r.height > 0);
  if (!renditions.length) return null;
  const sorted = [...renditions].sort((a, b) => a.height - b.height);
  const inRange = sorted.filter((r) => r.height >= TARGET_HEIGHT && r.height <= MAX_SOURCE_HEIGHT);
  if (inRange.length) return inRange[0];
  const under = sorted.filter((r) => r.height <= MAX_SOURCE_HEIGHT);
  return under.length ? under[under.length - 1] : sorted[0];
}

async function pixabay<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!env.pixabayApiKey) throw new StockError("Pixabay n'est pas configuré (clé PIXABAY_API_KEY manquante).", "NOT_CONFIGURED");
  const url = new URL(`https://pixabay.com${path}`);
  url.searchParams.set("key", env.pixabayApiKey);
  url.searchParams.set("safesearch", "true");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new StockError(`Pixabay a répondu ${res.status} : ${(await res.text()).slice(0, 200)}`, "UPSTREAM");
  return (await res.json()) as T;
}

/**
 * Second, independent catalog, curated separately from Pexels — the point is
 * that a subject Pexels comes up empty on often isn't empty here, not that
 * results are deduplicated against Pexels' (different libraries, different ids).
 *
 * Pixabay's video endpoint has no orientation filter, unlike its image one: a
 * clip is judged portrait or landscape from the rendition actually picked,
 * after the fact, rather than requested from the API up front.
 */
export async function searchPixabay(query: string, type: "video" | "image", limit: number, portraitOnly: boolean): Promise<StockResult[]> {
  // Pixabay rejects per_page under 3.
  const perPage = String(Math.max(3, limit));

  if (type === "image") {
    const data = await pixabay<{ hits: PixabayImageHit[] }>("/api/", {
      q: query,
      image_type: "photo",
      per_page: perPage,
      ...(portraitOnly ? { orientation: "vertical" } : {}),
    });
    return data.hits.map((h) => ({
      id: `pixabay-photo-${h.id}`,
      type: "image" as const,
      url: h.largeImageURL || h.webformatURL,
      thumbnailUrl: h.webformatURL,
      width: h.imageWidth,
      height: h.imageHeight,
      durationSec: null,
      author: h.user,
      sourceUrl: h.pageURL,
    }));
  }

  const data = await pixabay<{ hits: PixabayVideoHit[] }>("/api/videos/", { q: query, per_page: perPage });
  return data.hits.flatMap((h) => {
    const rendition = pickVideoRendition(h.videos);
    if (!rendition) return [];
    if (portraitOnly && rendition.height <= rendition.width) return [];
    return [{
      id: `pixabay-video-${h.id}`,
      type: "video" as const,
      url: rendition.url,
      thumbnailUrl: `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg`,
      width: rendition.width,
      height: rendition.height,
      durationSec: h.duration,
      author: h.user,
      sourceUrl: h.pageURL,
    }];
  });
}
