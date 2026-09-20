import { synthesizeElevenLabs, synthesizeOffline, type TTSOptions, type TTSResult } from "@/lib/tts/elevenlabs";
import { getVoice } from "@/lib/tts/voices";
import { env } from "@/lib/env";

export interface SynthesisRequest {
  /** Ordered text segments (hook, scenes…, CTA). Word timings carry the segment index. */
  segments: string[];
  voiceId: string;
  /** Already-resolved ElevenLabs voice id, when the caller looked one up itself (e.g. a cloned voice). Falls back to the static catalog otherwise. */
  providerVoiceId?: string;
  options?: TTSOptions;
}

/**
 * Provider-agnostic entry point. Joins segments with sentence breaks, tracks
 * segment boundaries by word index so captions can be mapped back to scenes.
 */
export async function synthesizeSpeech(req: SynthesisRequest): Promise<TTSResult> {
  const providerVoiceId = req.providerVoiceId || getVoice(req.voiceId).providerVoiceId;
  const cleaned = req.segments.map((s) => s.trim()).filter(Boolean);
  const text = cleaned.join(" ");
  const boundaries: number[] = [];
  let cursor = 0;
  for (const seg of cleaned) {
    boundaries.push(cursor);
    cursor += seg.split(/\s+/).filter(Boolean).length;
  }

  if (env.elevenLabsApiKey) {
    return synthesizeElevenLabs(text, providerVoiceId, boundaries, req.options);
  }
  return synthesizeOffline(text, boundaries, req.options?.speed ?? 1);
}

export { TTSError } from "@/lib/tts/elevenlabs";
export type { TTSResult } from "@/lib/tts/elevenlabs";
