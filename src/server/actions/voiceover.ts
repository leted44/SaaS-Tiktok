"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { voiceoverRequestSchema } from "@/lib/validations";
import { createVoiceover, type VoiceoverSummary } from "@/lib/pipeline/voiceover";
import { guard, type ActionResult } from "@/server/action-result";

export async function generateVoiceoverAction(input: unknown): Promise<ActionResult<VoiceoverSummary>> {
  return guard(async () => {
    const sessionUser = await requireUser();
    const data = voiceoverRequestSchema.parse(input);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
    const summary = await createVoiceover(user, data);
    revalidatePath(`/studio/${data.projectId}`);
    return summary;
  });
}
