import type { AssetType } from "@prisma/client";

/** Hard ceiling on any single upload, direct-to-S3 or proxied. */
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;

export const ALLOWED_ASSET_TYPES: Record<string, AssetType> = {
  "image/png": "IMAGE",
  "image/jpeg": "IMAGE",
  "image/webp": "IMAGE",
  "image/gif": "IMAGE",
  "video/mp4": "VIDEO",
  "video/webm": "VIDEO",
  "video/quicktime": "VIDEO",
  "audio/mpeg": "AUDIO",
  "audio/mp3": "AUDIO",
  "audio/wav": "AUDIO",
  "audio/x-wav": "AUDIO",
  // Phones hand over m4a/aac far more often than mp3.
  "audio/mp4": "AUDIO",
  "audio/x-m4a": "AUDIO",
  "audio/aac": "AUDIO",
  "audio/ogg": "AUDIO",
};

/** Some pickers report a codec parameter (e.g. "audio/ogg;codecs=opus") — compare on the base type only. */
export function baseMimeType(type: string): string {
  return type.split(";")[0].trim();
}

/** Resolve the stored asset kind for an upload, or null when the type is not accepted. */
export function assetTypeFor(mimeType: string, kind: string): AssetType | null {
  if (kind === "logo") return "LOGO";
  return ALLOWED_ASSET_TYPES[baseMimeType(mimeType)] ?? null;
}
