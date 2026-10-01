import { promises as fs } from "fs";
import path from "path";
import { PutObjectCommand, S3Client, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

export interface StoredObject {
  key: string;
  url: string;
  sizeBytes: number;
}

/**
 * A bucket the app talks to over the S3 API. There are at most two:
 *
 * - the primary — Cloudflare R2 when it is configured, the S3_* bucket
 *   (Supabase) otherwise — where every new file is written;
 * - the legacy bucket — the S3_* bucket once R2 has taken over — only read
 *   from, for files stored before the move that have not been copied yet.
 */
interface Bucket {
  client: S3Client;
  name: string;
  /** Public URL prefix of the bucket's files, without a trailing slash. */
  publicBase: string;
}

let r2Cache: Bucket | null | undefined;
let s3Cache: Bucket | null | undefined;

function r2Bucket(): Bucket | null {
  if (r2Cache !== undefined) return r2Cache;
  const { accountId, bucket, accessKeyId, secretAccessKey, publicUrl, endpoint } = env.r2;
  r2Cache =
    accountId && bucket && accessKeyId && secretAccessKey && publicUrl
      ? {
          client: new S3Client({
            region: "auto",
            endpoint: endpoint || `https://${accountId}.r2.cloudflarestorage.com`,
            forcePathStyle: true,
            credentials: { accessKeyId, secretAccessKey },
            // R2 does not implement every checksum the SDK now adds by default;
            // Cloudflare's own guidance is to send them only when required.
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
          }),
          name: bucket,
          publicBase: publicUrl.replace(/\/$/, ""),
        }
      : null;
  return r2Cache;
}

function s3Bucket(): Bucket | null {
  if (s3Cache !== undefined) return s3Cache;
  const { endpoint, region, bucket, accessKeyId, secretAccessKey, publicUrl } = env.s3;
  s3Cache =
    env.storageDriver === "s3" && accessKeyId
      ? {
          client: new S3Client({ region, endpoint: endpoint || undefined, forcePathStyle: Boolean(endpoint), credentials: { accessKeyId, secretAccessKey } }),
          name: bucket,
          publicBase: publicUrl
            ? publicUrl.replace(/\/$/, "")
            : endpoint
              ? `${endpoint.replace(/\/$/, "")}/${bucket}`
              : `https://${bucket}.s3.${region}.amazonaws.com`,
        }
      : null;
  return s3Cache;
}

/** Where new files go; null means the local disk (development). */
function primary(): Bucket | null {
  return r2Bucket() ?? s3Bucket();
}

/** The bucket files stored before the move to R2 still sit in, until they are copied. */
function legacy(): Bucket | null {
  return r2Bucket() ? s3Bucket() : null;
}

/** Hosts this app's stored files are served from — current and legacy — for recognising "our" URLs. */
export function storageHosts(): string[] {
  const urls = [r2Bucket()?.publicBase, s3Bucket()?.publicBase, env.s3.endpoint, env.appUrl];
  const hosts = urls.map((u) => {
    try {
      return u ? new URL(u).host : null;
    } catch {
      return null;
    }
  });
  return [...new Set(hosts.filter((h): h is string => Boolean(h)))];
}

/** Local driver root (outside /public: Next only serves public files that existed at build time). */
// No explicit process.cwd(): the build tracer reads `process.cwd() + dynamic path`
// as "any file in the project" and copies the whole repo (.git, .next/cache…)
// into every function that imports this module. path.resolve already resolves
// against the cwd, so the result is the same.
export const LOCAL_ROOT = path.resolve(process.env.LOCAL_STORAGE_DIR ?? "storage");

function publicUrlFor(key: string): string {
  const bucket = primary();
  return bucket ? `${bucket.publicBase}/${key}` : `/api/files/${key}`;
}

/** Resolve a storage key to an absolute local path, refusing traversal outside the root. */
export function localPathFor(key: string): string | null {
  const target = path.resolve(LOCAL_ROOT, key);
  if (!target.startsWith(LOCAL_ROOT + path.sep)) return null;
  return target;
}

/** Every key is new, so a stored file never changes and may be cached forever. */
const IMMUTABLE = "public, max-age=31536000, immutable";

/** Upload a buffer and return its public URL. Works with local disk (dev) or S3-compatible storage. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
  const bucket = primary();
  if (bucket) {
    await bucket.client.send(new PutObjectCommand({ Bucket: bucket.name, Key: key, Body: body, ContentType: contentType, CacheControl: IMMUTABLE }));
    return { key, url: publicUrlFor(key), sizeBytes: body.length };
  }
  const target = path.join(LOCAL_ROOT, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body);
  return { key, url: publicUrlFor(key), sizeBytes: body.length };
}

export async function putFile(key: string, filePath: string, contentType: string): Promise<StoredObject> {
  const body = await fs.readFile(filePath);
  return putObject(key, body, contentType);
}

/** True when uploads can bypass the app server and go straight to the bucket. */
export function canPresignUploads(): boolean {
  return primary() !== null;
}

/**
 * Sign a one-shot PUT so the browser can send a file straight to the bucket.
 *
 * Routing an upload through the app instead means the bytes cross the network
 * twice — client to function, then function to bucket — and, on Vercel, they
 * never even arrive: a function request body is capped at 4.5 MB, so a 30 MB
 * video is uploaded in full and only then rejected with a 413. The signature
 * pins the key and the content type, and expires quickly, so it cannot be
 * replayed to overwrite anything else.
 */
export async function presignPut(key: string, contentType: string, expiresInSeconds = 600): Promise<string> {
  const bucket = primary();
  if (!bucket) throw new Error("Direct uploads need a storage bucket");
  return getSignedUrl(
    bucket.client,
    new PutObjectCommand({ Bucket: bucket.name, Key: key, ContentType: contentType, CacheControl: IMMUTABLE }),
    { expiresIn: expiresInSeconds },
  );
}

/**
 * Confirm an object landed in the bucket and report its real size. A direct
 * upload is only observed by the client, so the size it claims is not evidence
 * that anything was stored — this is what makes the asset record trustworthy.
 */
export async function headObject(key: string): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  const bucket = primary();
  if (!bucket) return null;
  try {
    const res = await bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: key }));
    return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
  } catch {
    return null;
  }
}

/**
 * Read an object straight from storage by its key — the bucket itself, or the
 * local disk — without going through its public URL. The slide renderer and
 * the AI style reference use this so an image never goes missing because its
 * public address changed, is rate-limited or is slow to answer. Null when the
 * object cannot be read.
 */
export async function readObject(key: string): Promise<Buffer | null> {
  const res = await readObjectDetailed(key);
  return "data" in res ? res.data : null;
}

/**
 * readObject, with the reason when it fails — for the admin image diagnostic.
 *
 * A file missing from R2 is looked for in the legacy bucket, and copied to R2
 * when found there, so a file stored before the move is still read — and is
 * read from Supabase only once.
 */
export async function readObjectDetailed(key: string): Promise<{ data: Buffer } | { error: string }> {
  const bucket = primary();
  if (!bucket) {
    try {
      const target = localPathFor(key);
      if (!target) return { error: "invalid key" };
      return { data: await fs.readFile(target) };
    } catch (err) {
      return { error: describe(err) };
    }
  }

  const res = await getFrom(bucket, key);
  const old = legacy();
  if ("data" in res || !old || !res.missing) return "data" in res ? { data: res.data } : { error: res.error };

  const fallback = await getFrom(old, key);
  if (!("data" in fallback)) return { error: `${res.error} — legacy: ${fallback.error}` };
  await bucket.client
    .send(new PutObjectCommand({ Bucket: bucket.name, Key: key, Body: fallback.data, ContentType: fallback.contentType ?? undefined, CacheControl: IMMUTABLE }))
    .catch((err) => console.error(`[storage] could not copy ${key} to the new bucket: ${describe(err)}`));
  return { data: fallback.data };
}

async function getFrom(bucket: Bucket, key: string): Promise<{ data: Buffer; contentType: string | null } | { error: string; missing: boolean }> {
  try {
    const res = await bucket.client.send(new GetObjectCommand({ Bucket: bucket.name, Key: key }));
    if (!res.Body) return { error: "empty body", missing: false };
    return { data: Buffer.from(await res.Body.transformToByteArray()), contentType: res.ContentType ?? null };
  } catch (err) {
    return { error: describe(err), missing: isMissing(err) };
  }
}

function isMissing(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}

function describe(err: unknown): string {
  const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  return [e.name, e.$metadata?.httpStatusCode, e.message].filter(Boolean).join(" · ").slice(0, 300) || "unknown error";
}

/** The public URL an uploaded object is served from. */
export function publicUrl(key: string): string {
  return publicUrlFor(key);
}

export async function deleteObject(key: string): Promise<void> {
  const bucket = primary();
  if (bucket) {
    await bucket.client.send(new DeleteObjectCommand({ Bucket: bucket.name, Key: key }));
    // Not copied yet, it may still sit in the legacy bucket only.
    const old = legacy();
    if (old) await old.client.send(new DeleteObjectCommand({ Bucket: old.name, Key: key })).catch(() => undefined);
    return;
  }
  await fs.rm(path.join(LOCAL_ROOT, key), { force: true });
}

/** Every kind of object `storageKey` can produce. */
const STORAGE_KINDS = ["audio", "video", "thumb", "asset"] as const;

/**
 * Erase everything a user owns, for real.
 *
 * `storageKey` puts the owner's id in the second path segment of every object
 * it writes, so a prefix listing finds all of them — including files whose
 * database row is already gone, which chasing each model's URL column would
 * miss. Called when an account is deleted: the privacy policy promises the
 * files go, and deleting the rows alone would leave them behind.
 */
export async function deleteUserObjects(userId: string): Promise<number> {
  const buckets = [primary(), legacy()].filter((b): b is Bucket => b !== null);
  let removed = 0;
  for (const kind of STORAGE_KINDS) {
    const prefix = `${kind}/${userId}/`;

    if (buckets.length === 0) {
      const dir = localPathFor(prefix);
      if (dir) {
        const existed = await fs.readdir(dir).catch(() => null);
        if (existed) removed += existed.length;
        await fs.rm(dir, { recursive: true, force: true });
      }
      continue;
    }

    for (const bucket of buckets) {
      let token: string | undefined;
      do {
        const page = await bucket.client.send(new ListObjectsV2Command({ Bucket: bucket.name, Prefix: prefix, ContinuationToken: token }));
        const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
        if (keys.length > 0) {
          await bucket.client.send(new DeleteObjectsCommand({ Bucket: bucket.name, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
          if (bucket === buckets[0]) removed += keys.length;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    }
  }
  return removed;
}

/** One stored file, as listed by `listStoredObjects`. */
export interface StoredEntry {
  key: string;
  lastModified: Date;
  sizeBytes: number;
}

/**
 * Every file `storageKey` ever wrote, in the bucket new files go to (or on the
 * local disk) — what the storage cleanup weighs against the database.
 */
export async function* listStoredObjects(): AsyncGenerator<StoredEntry> {
  const bucket = primary();
  for (const kind of STORAGE_KINDS) {
    if (!bucket) {
      const root = localPathFor(`${kind}/`);
      if (!root) continue;
      const users = await fs.readdir(root).catch(() => [] as string[]);
      for (const user of users) {
        const files = await fs.readdir(path.join(root, user)).catch(() => [] as string[]);
        for (const file of files) {
          const stat = await fs.stat(path.join(root, user, file)).catch(() => null);
          if (stat?.isFile()) yield { key: `${kind}/${user}/${file}`, lastModified: stat.mtime, sizeBytes: stat.size };
        }
      }
      continue;
    }
    let token: string | undefined;
    do {
      const page = await bucket.client.send(new ListObjectsV2Command({ Bucket: bucket.name, Prefix: `${kind}/`, ContinuationToken: token }));
      for (const o of page.Contents ?? []) {
        if (o.Key && o.LastModified) yield { key: o.Key, lastModified: o.LastModified, sizeBytes: o.Size ?? 0 };
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}

/** Delete many files at once — from the legacy bucket too, where a not-yet-copied one may still sit. */
export async function deleteObjects(keys: string[]): Promise<void> {
  const bucket = primary();
  if (!bucket) {
    await Promise.all(keys.map((key) => deleteObject(key)));
    return;
  }
  for (const target of [bucket, legacy()]) {
    if (!target) continue;
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      const send = target.client.send(new DeleteObjectsCommand({ Bucket: target.name, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
      // The legacy bucket may be unreachable (a restricted Supabase project); the file is gone from the one that counts.
      if (target === bucket) await send;
      else await send.catch(() => undefined);
    }
  }
}

/** Whether files are being moved: R2 is the primary bucket and the old one is still configured. */
export function storageMigrationInfo(): { from: string; to: string; legacyBases: string[]; toBase: string } | null {
  const to = r2Bucket();
  const from = legacy();
  if (!to || !from) return null;
  // A file of the old bucket may be linked by its public URL or, from older
  // builds, by its endpoint-style address — both are rewritten.
  const endpointBase = env.s3.endpoint ? `${env.s3.endpoint.replace(/\/$/, "")}/${env.s3.bucket}` : null;
  const legacyBases = [...new Set([from.publicBase, endpointBase].filter((u): u is string => Boolean(u)))];
  return { from: from.name, to: to.name, legacyBases, toBase: to.publicBase };
}

/**
 * Copy the legacy bucket's files to R2, in key order, from just after `after`,
 * for at most `budgetMs` — one call of a resumable migration. A file already
 * in R2 is skipped, so the copy can be run again safely and picks up where it
 * stopped. Returns the last key handled, to pass as `after` next time.
 */
export async function copyLegacyObjects(after: string | null, budgetMs: number): Promise<{ copied: number; skipped: number; bytes: number; failed: { key: string; error: string }[]; last: string | null; done: boolean }> {
  const to = r2Bucket();
  const from = legacy();
  if (!to || !from) throw new Error("R2 and the legacy bucket must both be configured");
  const deadline = Date.now() + budgetMs;
  const result = { copied: 0, skipped: 0, bytes: 0, failed: [] as { key: string; error: string }[], last: after, done: false };

  while (Date.now() < deadline) {
    const page = await from.client.send(new ListObjectsV2Command({ Bucket: from.name, StartAfter: result.last ?? undefined, MaxKeys: 100 }));
    const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k) && !k!.endsWith("/"));
    if (keys.length === 0) {
      result.done = true;
      break;
    }
    // A few at a time: fast enough, without a burst the old bucket would turn away.
    for (let i = 0; i < keys.length && Date.now() < deadline; i += 4) {
      const chunk = keys.slice(i, i + 4);
      await Promise.all(
        chunk.map(async (key) => {
          const exists = await to.client.send(new HeadObjectCommand({ Bucket: to.name, Key: key })).then(() => true, () => false);
          if (exists) return void result.skipped++;
          const got = await getFrom(from, key);
          if (!("data" in got)) return void result.failed.push({ key, error: got.error });
          try {
            await to.client.send(new PutObjectCommand({ Bucket: to.name, Key: key, Body: got.data, ContentType: got.contentType ?? undefined, CacheControl: IMMUTABLE }));
            result.copied++;
            result.bytes += got.data.length;
          } catch (err) {
            result.failed.push({ key, error: describe(err) });
          }
        }),
      );
      result.last = chunk[chunk.length - 1];
    }
    if (!page.IsTruncated && result.last === keys[keys.length - 1]) {
      result.done = true;
      break;
    }
  }
  return result;
}

/** Resolve a stored URL to something fetchable from the render worker (absolute). */
export function absoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${env.appUrl.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function storageKey(userId: string, kind: "audio" | "video" | "thumb" | "asset", filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${kind}/${userId}/${Date.now()}-${safe}`;
}
