import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import { absoluteUrl, putObject, readObject, storageKey } from "@/lib/storage";
import type { GeneratedImage } from "@/lib/ai/image-generator";

/**
 * Photos behind a carousel slide or a video scene — the visuals shared
 * infrastructure both formats' AI art-direction pipelines are built on.
 *
 * An image is always a copy in our own storage, never a link to the stock
 * site. Pixabay asks that its images be downloaded rather than hotlinked; a
 * copy also renders faster and cannot disappear from under a published post.
 * And because the renderer fetches whatever URL a slide or a layer holds,
 * only two kinds of URL are ever accepted: stock URLs, to copy from, and our
 * storage, to render — anything else would let a crafted request make the
 * server fetch arbitrary addresses.
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

/**
 * The storage key of an image this user stored, read from the path of its URL
 * whatever host it was served from: `asset/<userId>/<file>`, which is how every
 * AI image, stock copy and upload is filed (lib/storage storageKey).
 *
 * Matching on the host alone meant that a change of public storage domain
 * turned every existing image into "not ours": the renderer dropped it — a
 * black slide — and the next autosave wiped it from the carousel. A key found
 * this way is only ever read from our own storage, never fetched from the URL,
 * so recognising it whatever the host lets no outside address in.
 */
export function ownedAssetKey(url: string | null | undefined, userId: string): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, "http://local").pathname);
  } catch {
    return null;
  }
  const at = pathname.indexOf(`asset/${userId}/`);
  if (at < 0) return null;
  const key = pathname.slice(at);
  return key.includes("..") ? null : key;
}

/** Whether this user may keep this image on a slide: our storage by host, or one of their own stored files by path. */
export function isOwnImage(url: string, userId: string): boolean {
  return isOwnStorageUrl(url) || ownedAssetKey(url, userId) !== null;
}

/**
 * What the slide renderer draws: the image's bytes read straight from storage,
 * as a data URI, so drawing it never depends on its public URL answering.
 * Falls back to fetching the public URL for an image stored some other way.
 */
export async function slideImageSrc(url: string | null | undefined, userId: string): Promise<string | null> {
  if (!url) return null;
  const key = ownedAssetKey(url, userId);
  if (key) {
    const data = await readObject(key);
    const type = data && data.length <= MAX_BYTES ? sniff(data) : null;
    if (data && type) return `data:${type};base64,${data.toString("base64")}`;
    console.error(`[slide-image] could not read stored image ${key} (${data ? `${data.length} bytes, unknown type` : "not found"})`);
  }
  return renderableImageUrl(url);
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

export class AiImageStoreError extends Error {}

/**
 * Copy a stock photo into the user's storage and return the stored URL.
 *
 * The slide renderer draws JPEG and PNG only, so the bytes themselves are
 * checked — a content-type header can claim anything.
 */
export async function copyStockImage(userId: string, sourceUrl: string): Promise<string> {
  if (!isStockUrl(sourceUrl)) throw new AiImageStoreError("Cette image ne vient pas d'une banque d'images autorisée.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(largerRendition(sourceUrl), { signal: controller.signal, redirect: "follow" });
  } catch {
    throw new AiImageStoreError("La banque d'images ne répond pas. Réessayez dans un instant.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new AiImageStoreError(`Impossible de récupérer cette image (${res.status}).`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new AiImageStoreError("Cette image est trop lourde.");
  const type = sniff(buf);
  if (!type) throw new AiImageStoreError("Format d'image non pris en charge (JPEG ou PNG uniquement).");

  const stored = await putObject(storageKey(userId, "asset", `carousel-${nanoid(10)}.${type === "image/png" ? "png" : "jpg"}`), buf, type);
  return stored.url;
}

/**
 * Store an AI-generated image in the user's storage, checked the same way as
 * a stock copy, so the renderer and the editor never need to know which
 * source produced a slide's image.
 *
 * `kind` only namespaces the filename (carousel slides keep their original
 * "carousel-ai-" prefix, so the schema's legacy sourceless-image detection
 * keeps matching files generated before every image carried its own
 * `source`); it has no effect on validation or storage.
 */
export async function storeGeneratedImage(userId: string, image: GeneratedImage, kind: "carousel" | "video" = "carousel"): Promise<string> {
  if (image.data.length > MAX_BYTES) throw new AiImageStoreError("L'image générée est trop lourde.");
  const type = sniff(image.data);
  if (!type) throw new AiImageStoreError(`Format d'image inattendu renvoyé par l'IA (${image.mimeType}).`);
  const stored = await putObject(storageKey(userId, "asset", `${kind}-ai-${nanoid(10)}.${type === "image/png" ? "png" : "jpg"}`), image.data, type);
  return stored.url;
}

/**
 * Read back an image already in our storage — the cover, handed to the image
 * model as the style reference for the rest of the series. Null when it is
 * not ours or cannot be read: generation then goes on without a reference.
 */
export async function readOwnImage(url: string, userId?: string): Promise<GeneratedImage | null> {
  // Straight from storage when the key is known — no dependency on the public URL.
  const key = userId ? ownedAssetKey(url, userId) : null;
  if (key) {
    const data = await readObject(key);
    const type = data && data.length <= MAX_BYTES ? sniff(data) : null;
    if (data && type) return { data, mimeType: type };
  }
  if (!isOwnStorageUrl(url)) return null;
  try {
    const res = await fetch(absoluteUrl(url), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    const type = data.length <= MAX_BYTES ? sniff(data) : null;
    return type ? { data, mimeType: type } : null;
  } catch {
    return null;
  }
}
