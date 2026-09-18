import { promises as fs } from "fs";
import path from "path";
import { PutObjectCommand, S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

export async function deleteObject(key: string): Promise<void> {
  if (env.storageDriver === "s3" && env.s3.accessKeyId) {
    await s3().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return;
  }
  await fs.rm(path.join(LOCAL_ROOT, key), { force: true });
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
