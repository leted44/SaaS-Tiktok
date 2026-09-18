import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { synthesizeSpeech } from "@/lib/tts";
import { getVoice, VOICE_PREVIEW_TEXT } from "@/lib/tts/voices";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ voiceId: z.string(), text: z.string().max(300).optional(), speed: z.number().min(0.7).max(1.3).optional() });

/** Short voice preview — free of charge, capped at 300 characters to protect the TTS quota. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const voice = getVoice(parsed.data.voiceId);
  try {
    const result = await synthesizeSpeech({ segments: [parsed.data.text?.trim() || VOICE_PREVIEW_TEXT], voiceId: voice.id, options: { speed: parsed.data.speed } });
    return new NextResponse(new Uint8Array(result.audio), {
      headers: { "content-type": result.mimeType, "x-tts-provider": result.provider, "x-duration-ms": String(result.durationMs), "cache-control": "private, max-age=3600" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Preview failed" }, { status: 502 });
  }
}
