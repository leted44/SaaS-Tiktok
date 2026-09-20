import type { Metadata } from "next";
import { getCurrentUser, getCustomVoice } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { VoiceCatalog } from "@/components/voices/voice-catalog";
import { VOICES } from "@/lib/tts/voices";
import { customVoiceDefinition } from "@/lib/tts/resolve-voice";
import { MUSIC_TRACKS } from "@/lib/music/library";
import { effectivePlanDef } from "@/lib/plans";
import { integrations } from "@/lib/env";

export const metadata: Metadata = { title: "Voix" };
export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  const user = await getCurrentUser();
  const customVoice = await getCustomVoice(user.id);
  const voices = customVoice ? [{ ...customVoiceDefinition(customVoice.name), premium: false }, ...VOICES] : VOICES;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Voix off & moteur audio" description="Testez les voix IA avec votre propre texte, puis définissez votre voix et musique par défaut pour les nouveaux projets." />
      <VoiceCatalog voices={voices} tracks={MUSIC_TRACKS} premiumAllowed={effectivePlanDef(user).premiumVoices} ttsConfigured={integrations.tts()} />
      <p className="mt-6 text-xs text-muted-foreground">Le clonage de votre propre voix (forfaits Pro et Agence) se fait depuis l'onglet <span className="text-foreground">Audio</span> d'un projet, dans le Studio{customVoice ? " — elle apparaît ci-dessus sous « " + customVoice.name + " »." : "."}</p>
    </div>
  );
}
