"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { brandKitSchema } from "@/lib/validations";
import { getCurrentWorkspace } from "@/server/queries";
import { guard, type ActionResult } from "@/server/action-result";

export async function updateBrandKit(input: unknown): Promise<ActionResult<undefined>> {
  return guard(async () => {
    await requireUser();
    const data = brandKitSchema.parse(input);
    const workspace = await getCurrentWorkspace();
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        name: data.name,
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
        accentColor: data.accentColor,
        fontFamily: data.fontFamily,
        captionPreset: data.captionPreset,
        captionPosition: data.captionPosition,
        defaultVoiceId: data.defaultVoiceId,
        defaultLanguage: data.defaultLanguage,
        defaultAspect: data.defaultAspect,
        defaultMusicId: data.defaultMusicId,
        watermarkUrl: data.watermarkUrl || null,
        watermarkOpacity: data.watermarkOpacity,
        watermarkPosition: data.watermarkPosition,
        toneOfVoice: data.toneOfVoice,
        targetAudience: data.targetAudience,
      },
    });
    revalidatePath("/brand");
    revalidatePath("/dashboard");
    return undefined;
  });
}
