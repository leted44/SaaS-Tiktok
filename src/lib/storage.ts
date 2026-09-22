import { promises as fs } from "fs";
import path from "path";
import { PutObjectCommand, S3Client, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

export interface StoredObject {
  key: string;
  url: string;
  sizeBytes: number;
}

let s3Client: S3Client | null = null;
function s3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint || undefined,
      forcePathStyle: Boolean(env.s3.endpoint),
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
    });
  }
  return s3Client;
}

/** Local driver root (outside /public: Next only serves public files that existed at build time). */
export const LOCAL_ROOT = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? "storage");

function publicUrlFor(key: string): string {
  if (env.storageDriver === "s3") {
    if (env.s3.publicUrl) return `${env.s3.publicUrl.replace(/\/$/, "")}/${key}`;
    if (env.s3.endpoint) return `${env.s3.endpoint.replace(/\/$/, "")}/${env.s3.bucket}/${key}`;
    return `https://${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com/${key}`;
  }
  return `/api/files/${key}`;
}

/** Resolve a storage key to an absolute local path, refusing traversal outside the root. */
export function localPathFor(key: string): string | null {
  const target = path.resolve(LOCAL_ROOT, key);
  if (!target.startsWith(LOCAL_ROOT + path.sep)) return null;
  return target;
}

/** Upload a buffer and return its public URL. Works with local disk (dev) or S3-compatible storage. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
  if (env.storageDriver === "s3" && env.s3.accessKeyId) {
    await s3().send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
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
  return env.storageDriver === "s3" && Boolean(env.s3.accessKeyId);
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
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }),
    { expiresIn: expiresInSeconds },
  );
}

/**
 * Confirm an object landed in the bucket and report its real size. A direct
 * upload is only observed by the client, so the size it claims is not evidence
 * that anything was stored — this is what makes the asset record trustworthy.
 */
export async function headObject(key: string): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
  } catch {
    return null;
  }
}

/** The public URL an uploaded object is served from. */
export function publicUrl(key: string): string {
  return publicUrlFor(key);
}

export async function deleteObject(key: string): Promise<void> {
  if (env.storageDriver === "s3" && env.s3.accessKeyId) {
    await s3().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
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
  let removed = 0;
  for (const kind of STORAGE_KINDS) {
    const prefix = `${kind}/${userId}/`;

    if (env.storageDriver !== "s3" || !env.s3.accessKeyId) {
      const dir = localPathFor(prefix);
      if (dir) {
        const existed = await fs.readdir(dir).catch(() => null);
        if (existed) removed += existed.length;
        await fs.rm(dir, { recursive: true, force: true });
      }
      continue;
    }

    let token: string | undefined;
    do {
      const page = await s3().send(new ListObjectsV2Command({ Bucket: env.s3.bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
      if (keys.length > 0) {
        await s3().send(new DeleteObjectsCommand({ Bucket: env.s3.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
        removed += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
  return removed;
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
