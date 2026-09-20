import { prisma } from "@/lib/prisma";
import { getVoice, type VoiceDefinition } from "@/lib/tts/voices";

/** The single reserved id a user's own cloned voice is selected and stored under. */
export const CUSTOM_VOICE_ID = "custom";

export function customVoiceDefinition(name: string): VoiceDefinition {
  return {
    id: CUSTOM_VOICE_ID,
    providerVoiceId: "",
    name,
    gender: "neutral",
    accent: "Personnalisé",
    language: "custom",
    style: "Voix clonée",
    description: "Votre voix, clonée par IA à partir de votre propre enregistrement.",
    premium: true,
    tags: ["clone", "personnalisé"],
  };
}

/**
 * Resolves a voice id to a definition with a real ElevenLabs provider id,
 * looking up the caller's own cloned voice in the database when the id is
 * the reserved "custom" slot. Static catalog voices never touch the database.
 */
export async function resolveVoice(id: string, userId: string): Promise<VoiceDefinition> {
  if (id === CUSTOM_VOICE_ID) {
    const custom = await prisma.customVoice.findUnique({ where: { userId } });
    if (!custom) throw new Error("Vous n'avez pas encore de voix clonée. Enregistrez-en une dans l'onglet Audio.");
    return { ...customVoiceDefinition(custom.name), providerVoiceId: custom.providerVoiceId };
  }
  return getVoice(id);
}
