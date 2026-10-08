"use server";

import { revalidatePath } from "next/cache";
import { zipSync } from "fflate";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { isAdmin } from "@/lib/plans";
import { isOwnImage, readOwnImage } from "@/lib/ai/images";
import { absoluteUrl, publicUrl, putObject, storageKey } from "@/lib/storage";
import { CLONE_MAX_PHOTOS, CLONE_MIN_PHOTOS } from "@/lib/ai/clone-limits";
import { checkCloneTraining, readClone, startCloneTraining, type CloneState } from "@/lib/ai/clone";
import { guard, type ActionResult } from "@/server/action-result";

/**
 * The creator's clone (lib/ai/clone), set on a space: the photos are zipped
 * into storage for fal to download, the training is started, and its status
 * is read back while the Espaces page is open. Admin only for now — it costs
 * about 2 $ per training, with no credits charged.
 */

async function adminSpace(spaceId: string) {
  const user = await requireDbUser();
  if (!isAdmin(user.role)) throw new Error("Réservé à l'administrateur pour l'instant.");
  const space = await prisma.space.findFirst({ where: { id: spaceId, userId: user.id }, select: { id: true, clone: true } });
  if (!space) throw new Error("Cet espace n'existe plus.");
  return { user, space };
}

async function save(spaceId: string, state: CloneState | null) {
  await prisma.space.update({ where: { id: spaceId }, data: { clone: state ? (state as unknown as Prisma.InputJsonValue) : Prisma.DbNull } });
  revalidatePath("/spaces");
}

export async function startCloneAction(spaceId: string, photoUrls: string[]): Promise<ActionResult<{ clone: CloneState }>> {
  return guard(async () => {
    const { user, space } = await adminSpace(spaceId);
    if (readClone(space.clone)?.status === "training") throw new Error("Un entraînement est déjà en cours pour cet espace.");
    const urls = [...new Set(photoUrls)].filter((u) => isOwnImage(u, user.id)).slice(0, CLONE_MAX_PHOTOS);
    if (urls.length < CLONE_MIN_PHOTOS) throw new Error(`Il faut au moins ${CLONE_MIN_PHOTOS} photos de toi (tu en as envoyé ${urls.length}).`);

    // One zip of the photos, the format fal's trainer reads.
    const files: Record<string, Uint8Array> = {};
    for (const [i, url] of urls.entries()) {
      const image = await readOwnImage(url, user.id);
      if (image) files[`photo-${String(i + 1).padStart(2, "0")}.${image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "jpg"}`] = new Uint8Array(image.data);
    }
    if (Object.keys(files).length < CLONE_MIN_PHOTOS) throw new Error("Certaines photos n'ont pas pu être lues. Envoie des JPEG ou des PNG.");
    const key = storageKey(user.id, "asset", `clone-${nanoid(8)}.zip`);
    await putObject(key, Buffer.from(zipSync(files, { level: 0 })), "application/zip");

    // A word that means nothing else, so the model learns it as this one person.
    const trigger = `vsp${nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const { statusUrl, responseUrl } = await startCloneTraining(absoluteUrl(publicUrl(key)), trigger);
    const clone: CloneState = { status: "training", trigger, photoUrl: urls[0], photos: Object.keys(files).length, statusUrl, responseUrl, loraUrl: null, loraBackupUrl: null, error: null, startedAt: new Date().toISOString(), readyAt: null };
    await save(space.id, clone);
    return { clone };
  });
}

/** Keep the trained file ourselves: fal's link may expire, and a file in our storage can be downloaded. Null when it could not be copied. */
async function backupLora(userId: string, clone: CloneState): Promise<string | null> {
  if (!clone.loraUrl) return null;
  try {
    const res = await fetch(clone.loraUrl, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length === 0 || data.length > 600 * 1024 * 1024) return null;
    const stored = await putObject(storageKey(userId, "asset", `clone-${clone.trigger}.safetensors`), data, "application/octet-stream");
    return stored.url;
  } catch (err) {
    console.error("[clone] could not copy the trained file to storage:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Read the training's status from fal and keep it on the space; a finished clone not yet copied to our storage is copied. */
export async function refreshCloneAction(spaceId: string): Promise<ActionResult<{ clone: CloneState | null }>> {
  return guard(async () => {
    const { user, space } = await adminSpace(spaceId);
    const current = readClone(space.clone);
    if (!current) return { clone: null };
    if (current.status === "ready") {
      if (current.loraBackupUrl) return { clone: current };
      const backup = await backupLora(user.id, current);
      if (!backup) return { clone: current };
      const clone = { ...current, loraBackupUrl: backup };
      await save(space.id, clone);
      return { clone };
    }
    if (current.status !== "training") return { clone: current };
    const result = await checkCloneTraining(current);
    if (result.status === "training") return { clone: current };
    let clone: CloneState = result.status === "ready" ? { ...current, status: "ready", loraUrl: result.loraUrl, readyAt: new Date().toISOString() } : { ...current, status: "failed", error: result.error };
    // The first save keeps the clone usable at once; the copy comes after and never blocks it.
    await save(space.id, clone);
    if (clone.status === "ready") {
      const backup = await backupLora(user.id, clone);
      if (backup) {
        clone = { ...clone, loraBackupUrl: backup };
        await save(space.id, clone);
      }
    }
    return { clone };
  });
}

/** Forget the clone: the space's images go back to its character sheet, or to none. */
export async function clearCloneAction(spaceId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const { space } = await adminSpace(spaceId);
    await save(space.id, null);
    return undefined;
  });
}
