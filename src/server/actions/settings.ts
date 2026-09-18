"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, signOut } from "@/lib/auth";
import { guard, type ActionResult } from "@/server/action-result";

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

export async function deleteAccount(): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    await prisma.user.delete({ where: { id: user.id } });
    await signOut({ redirectTo: "/" });
    return undefined;
  });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
