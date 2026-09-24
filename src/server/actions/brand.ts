"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { effectivePlanDef } from "@/lib/plans";
import { CUSTOM_VOICE_ID } from "@/lib/tts/resolve-voice";
import { brandKitSchema } from "@/lib/validations";
import { getCurrentWorkspace } from "@/server/queries";
import { guard, type ActionResult } from "@/server/action-result";

export async function updateBrandKit(input: unknown): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireDbUser();
    const data = brandKitSchema.parse(input);
    if (data.defaultVoiceId === CUSTOM_VOICE_ID) {
      if (!effectivePlanDef(user).voiceCloning) throw new Error("Ta voix clonée est réservée aux forfaits Pro et Agence.");
      if (!(await prisma.customVoice.findUnique({ where: { userId: user.id }, select: { id: true } }))) throw new Error("Tu n'as pas encore de voix clonée. Crée-la dans le studio (onglet Audio).");
    }
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
