import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { putObject, storageKey } from "@/lib/storage";
import { cloneVoice, deleteClonedVoice, TTSError, type VoiceSampleFile } from "@/lib/tts/elevenlabs";
import { chargeCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { isAdmin, effectivePlanDef, CREDIT_COSTS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  // A browser that supports no audio-only container records the microphone
  // into a video one instead. The track inside is still just audio, and
  // ElevenLabs rejects anything that isn't.
  "video/webm",
  "video/mp4",
]);

/** MediaRecorder reports e.g. "audio/webm;codecs=opus" — compare on the base type only. */
function baseMimeType(type: string): string {
  return type.split(";")[0].trim();
}

/** Create or replace the caller's cloned voice. Consent is mandatory and checked server-side, not just in the UI. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const consent = form.get("consent") === "true";
  if (!consent) {
    return NextResponse.json({ error: "Vous devez confirmer qu'il s'agit de votre voix ou que vous avez l'autorisation de la personne enregistrée." }, { status: 400 });
  }
  const name = String(form.get("name") ?? "Ma voix").trim().slice(0, 60) || "Ma voix";
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "Aucun fichier audio fourni." }, { status: 400 });
  let totalBytes = 0;
  for (const f of files) {
    if (!ALLOWED_TYPES.has(baseMimeType(f.type))) return NextResponse.json({ error: `Type de fichier non pris en charge : ${f.type}` }, { status: 415 });
    totalBytes += f.size;
  }
  if (totalBytes > MAX_BYTES) return NextResponse.json({ error: "Les échantillons dépassent 25 Mo au total." }, { status: 413 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!effectivePlanDef(user).voiceCloning) {
    return NextResponse.json({ error: "Le clonage vocal est réservé aux forfaits Pro et Agence." }, { status: 403 });
  }

  const admin = isAdmin(user.role);
  const cost = CREDIT_COSTS.VOICE_CLONE;
  if (!admin) {
    try {
      await chargeCredits(user.id, cost, "VOICE_CLONE", "Clonage de voix");
    } catch (err) {
      if (err instanceof InsufficientCreditsError) return NextResponse.json({ error: err.message, code: "INSUFFICIENT_CREDITS" }, { status: 402 });
      throw err;
    }
  }

  try {
    const sampleFiles: VoiceSampleFile[] = await Promise.all(
      files.map(async (f, i) => ({ buffer: Buffer.from(await f.arrayBuffer()), filename: f.name || `sample-${i}`, mimeType: f.type })),
    );

    const existing = await prisma.customVoice.findUnique({ where: { userId: user.id } });
    if (existing) await deleteClonedVoice(existing.providerVoiceId);

    const { providerVoiceId } = await cloneVoice(name, sampleFiles);
    const stored = await putObject(storageKey(user.id, "audio", `voice-clone-${Date.now()}.${extFor(sampleFiles[0].mimeType)}`), sampleFiles[0].buffer, sampleFiles[0].mimeType);

    const customVoice = await prisma.customVoice.upsert({
      where: { userId: user.id },
      create: { userId: user.id, name, providerVoiceId, sampleUrl: stored.url, consentConfirmed: true },
      update: { name, providerVoiceId, sampleUrl: stored.url, consentConfirmed: true },
    });

    return NextResponse.json({ voice: { id: "custom", name: customVoice.name, sampleUrl: customVoice.sampleUrl } });
  } catch (err) {
    if (!admin) await refundCredits(user.id, cost, "Remboursement — le clonage de voix a échoué");
    const message = err instanceof TTSError ? err.message : err instanceof Error ? err.message : "Échec du clonage de voix";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const existing = await prisma.customVoice.findUnique({ where: { userId: session.user.id } });
  if (!existing) return NextResponse.json({ ok: true });
  await deleteClonedVoice(existing.providerVoiceId);
  await prisma.customVoice.delete({ where: { userId: session.user.id } });
  return NextResponse.json({ ok: true });
}

function extFor(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("webm")) return "webm";
  return "mp3";
}
