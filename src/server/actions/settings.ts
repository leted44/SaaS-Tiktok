"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, signOut } from "@/lib/auth";
import { guard, type ActionResult } from "@/server/action-result";
import { deleteUserObjects } from "@/lib/storage";
import { deleteClonedVoice } from "@/lib/tts/elevenlabs";

const profileSchema = z.object({ name: z.string().min(2).max(60) });
const passwordSchema = z.object({ current: z.string().min(1), next: z.string().min(8).max(128) });

export async function updateProfile(input: unknown): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const data = profileSchema.parse(input);
    await prisma.user.update({ where: { id: user.id }, data: { name: data.name } });
    revalidatePath("/settings");
    return undefined;
  });
}

export async function changePassword(input: unknown): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const sessionUser = await requireUser();
    const data = passwordSchema.parse(input);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
    if (user.passwordHash) {
      const ok = await bcrypt.compare(data.current, user.passwordHash);
      if (!ok) throw new Error("Le mot de passe actuel est incorrect.");
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.next, 12) } });
    return undefined;
  });
}

/**
 * Close an account and erase what it left behind.
 *
 * Deleting the row cascades through the database, but the uploaded files live
 * in object storage and the cloned voice lives on ElevenLabs — neither follows
 * a foreign key. The privacy policy promises both go, so both are removed here,
 * before the row that tells us where to find them disappears.
 *
 * The external cleanups are best-effort: a storage or provider outage must not
 * trap someone in an account they asked to delete.
 */
export async function deleteAccount(): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();

    const clone = await prisma.customVoice.findUnique({ where: { userId: user.id }, select: { providerVoiceId: true } });
    if (clone) await deleteClonedVoice(clone.providerVoiceId).catch(() => undefined);
    await deleteUserObjects(user.id).catch(() => undefined);

    await prisma.user.delete({ where: { id: user.id } });
    await signOut({ redirectTo: "/" });
    return undefined;
  });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
