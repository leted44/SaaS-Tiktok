import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import { absoluteUrl, putObject, storageKey } from "@/lib/storage";

/**
 * Photos on carousel slides.
 *
 * A slide image is always a copy in our own storage, never a link to the stock
 * site. Pixabay asks that its images be downloaded rather than hotlinked; a
 * copy also renders faster and cannot disappear from under a published post.
 * And because the renderer fetches whatever URL a slide holds, only two kinds
 * of URL are ever accepted: stock URLs, to copy from, and our storage, to
 * render — anything else would let a crafted request make the server fetch
 * arbitrary addresses.
 */

const STOCK_HOSTS = new Set(["images.pexels.com", "pixabay.com", "cdn.pixabay.com"]);
const MAX_BYTES = 10 * 1024 * 1024;

function host(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function isStockUrl(url: string): boolean {
  const h = host(url);
  return Boolean(h && STOCK_HOSTS.has(h) && url.startsWith("https://"));
}

/** Whether a URL points into this app's own storage — the only images a slide may render. */
export function isOwnStorageUrl(url: string): boolean {
  if (url.startsWith("/api/files/")) return true;
  const h = host(url);
  if (!h) return false;
  const own = [env.s3.publicUrl, env.s3.endpoint, env.appUrl].map((u) => (u ? host(u) : null)).filter(Boolean);
  return own.includes(h);
}

/** The absolute URL the renderer fetches, or null when the stored value is not ours. */
export function renderableImageUrl(url: string | null | undefined): string | null {
  if (!url || !isOwnStorageUrl(url)) return null;
  return absoluteUrl(url);
}

/**
 * Pexels serves a small crop by default; ask for one large enough to fill a
 * full-bleed 1080-wide cover without visible upscaling.
 */
function largerRendition(url: string): string {
  if (host(url) !== "images.pexels.com") return url;
  const u = new URL(url);
  u.searchParams.set("w", "1200");
  u.searchParams.set("h", "1500");
  u.searchParams.set("fit", "crop");
  return u.toString();
}

function sniff(buf: Buffer): "image/jpeg" | "image/png" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

export class CarouselImageError extends Error {}

/**
 * Copy a stock photo into the user's storage and return the stored URL.
 *
 * The slide renderer draws JPEG and PNG only, so the bytes themselves are
 * checked — a content-type header can claim anything.
 */
export async function copyStockImage(userId: string, sourceUrl: string): Promise<string> {
  if (!isStockUrl(sourceUrl)) throw new CarouselImageError("Cette image ne vient pas d'une banque d'images autorisée.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(largerRendition(sourceUrl), { signal: controller.signal, redirect: "follow" });
  } catch {
    throw new CarouselImageError("La banque d'images ne répond pas. Réessayez dans un instant.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new CarouselImageError(`Impossible de récupérer cette image (${res.status}).`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new CarouselImageError("Cette image est trop lourde.");
  const type = sniff(buf);
  if (!type) throw new CarouselImageError("Format d'image non pris en charge (JPEG ou PNG uniquement).");

  const stored = await putObject(storageKey(userId, "asset", `carousel-${nanoid(10)}.${type === "image/png" ? "png" : "jpg"}`), buf, type);
  return stored.url;
}

// Stock copies made before `source` was recorded: copyStockImage names them
// `carousel-<10-char id>`, which an uploaded photo's name never is.
const LEGACY_STOCK_COPY = /-carousel-[A-Za-z0-9_-]{10}\.(?:jpg|png)$/;

/** Whether a slide photo came from the stock libraries, and so may be swapped for another one. */
export function isStockPhoto(image: { url: string; source?: string }): boolean {
  return Boolean(image.source) || LEGACY_STOCK_COPY.test(image.url);
}
