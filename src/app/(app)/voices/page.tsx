import type { Metadata } from "next";
import { getCurrentUser } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { VoiceCatalog } from "@/components/voices/voice-catalog";
import { VOICES } from "@/lib/tts/voices";
import { MUSIC_TRACKS } from "@/lib/music/library";
import { PLANS } from "@/lib/plans";
import { integrations } from "@/lib/env";

export const metadata: Metadata = { title: "Voix" };
export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Voix off & moteur audio" description="Testez les voix IA avec votre propre texte, puis définissez votre voix et musique par défaut pour les nouveaux projets." />
      <VoiceCatalog voices={VOICES} tracks={MUSIC_TRACKS} premiumAllowed={PLANS[user.plan].premiumVoices} ttsConfigured={integrations.tts()} />
    </div>
  );
}
