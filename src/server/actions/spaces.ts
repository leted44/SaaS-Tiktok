"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { spaceInputSchema } from "@/lib/spaces";
import { guard, type ActionResult } from "@/server/action-result";

/** First validation message, in French, instead of guard()'s generic one for a ZodError. */
function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Données invalides.");
  return result.data;
}

const MAX_SPACES = 20;

/** Create (id = null) or update a space. */
export async function saveSpaceAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const user = await requireUser();
    const data = parseOrThrow(spaceInputSchema, input);
    if (id) {
      const { count } = await prisma.space.updateMany({ where: { id, userId: user.id }, data });
      if (!count) throw new Error("Cet espace n'existe plus.");
      revalidatePath("/projects");
      revalidatePath("/autopilot");
      return { id };
    }
    const existing = await prisma.space.count({ where: { userId: user.id } });
    if (existing >= MAX_SPACES) throw new Error(`${MAX_SPACES} espaces au maximum.`);
    const space = await prisma.space.create({ data: { ...data, userId: user.id } });
    revalidatePath("/projects");
    revalidatePath("/autopilot");
    return { id: space.id };
  });
}

/** Delete a space. Its projects stay — they just lose the tag. */
export async function deleteSpaceAction(id: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const { count } = await prisma.space.deleteMany({ where: { id, userId: user.id } });
    if (!count) throw new Error("Cet espace n'existe plus.");
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return undefined;
  });
}

/** Tag a project with a space, or clear it (spaceId = null). */
export async function setProjectSpaceAction(projectId: string, spaceId: string | null): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    if (spaceId) {
      const owned = await prisma.space.findFirst({ where: { id: spaceId, userId: user.id }, select: { id: true } });
      if (!owned) throw new Error("Cet espace n'existe plus.");
    }
    const { count } = await prisma.project.updateMany({ where: { id: projectId, userId: user.id }, data: { spaceId } });
    if (!count) throw new Error("Ce projet n'existe plus.");
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return undefined;
  });
}
