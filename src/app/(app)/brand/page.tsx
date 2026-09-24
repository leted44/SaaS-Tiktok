import type { Metadata } from "next";
import { getCurrentWorkspace, getCurrentUser } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { BrandKitForm } from "@/components/brand/brand-kit-form";
import { VOICES } from "@/lib/tts/voices";
import { MUSIC_TRACKS } from "@/lib/music/library";
import { effectivePlanDef } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { customVoiceDefinition } from "@/lib/tts/resolve-voice";

export const metadata: Metadata = { title: "Charte de marque" };
export const dynamic = "force-dynamic";

export default async function BrandPage() {
  const [workspace, user] = await Promise.all([getCurrentWorkspace(), getCurrentUser()]);
  const plan = effectivePlanDef(user);
  const customVoice = plan.voiceCloning ? await prisma.customVoice.findUnique({ where: { userId: user.id }, select: { name: true } }) : null;
  // The user's own cloned voice first, then the catalogue.
  const voices = [
    ...(customVoice ? [{ ...customVoiceDefinition(customVoice.name), premium: false, style: "Ta voix clonée" }] : []),
    ...VOICES,
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Charte de marque" description="Réglages par défaut appliqués à chaque nouveau projet : couleurs, polices, style de sous-titres, voix, filigrane et ton." />
      <BrandKitForm
        initial={{
          name: workspace.name,
          primaryColor: workspace.primaryColor,
          secondaryColor: workspace.secondaryColor,
          accentColor: workspace.accentColor,
          fontFamily: workspace.fontFamily,
          captionPreset: workspace.captionPreset as "hormozi",
          captionPosition: workspace.captionPosition as "top" | "center" | "bottom",
          defaultVoiceId: workspace.defaultVoiceId,
          defaultLanguage: workspace.defaultLanguage,
          defaultAspect: workspace.defaultAspect,
          defaultMusicId: workspace.defaultMusicId,
          watermarkUrl: workspace.watermarkUrl ?? "",
          watermarkOpacity: workspace.watermarkOpacity,
          watermarkPosition: workspace.watermarkPosition as "bottom-right",
          toneOfVoice: workspace.toneOfVoice,
          targetAudience: workspace.targetAudience,
        }}
        voices={voices.map((v) => ({ id: v.id, name: v.name, premium: v.premium, style: v.style }))}
        tracks={MUSIC_TRACKS.map((t) => ({ id: t.id, name: t.name }))}
        premiumAllowed={plan.premiumVoices}
        watermarkForced={plan.watermark}
      />
    </div>
  );
}
