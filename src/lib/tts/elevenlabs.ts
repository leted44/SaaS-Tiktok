import { env } from "@/lib/env";
import type { WordTiming } from "@/lib/validations";
import { alignmentToWordTimings, estimateWordTimings } from "@/lib/captions/align";

export interface TTSOptions {
  stability?: number;
  similarity?: number;
  speed?: number;
  language?: string;
}

export interface TTSResult {
  audio: Buffer;
  mimeType: string;
  durationMs: number;
  wordTimings: WordTiming[];
  provider: "elevenlabs" | "offline";
}

interface ElevenLabsTimestampResponse {
  audio_base64: string;
  alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null;
  normalized_alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null;
}

export class TTSError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "UPSTREAM" | "QUOTA") {
    super(message);
  }
}

/**
 * Synthesize speech with ElevenLabs and return audio + word-level timings.
 * Uses the /with-timestamps endpoint so kinetic captions are sample-accurate.
 */
export async function synthesizeElevenLabs(text: string, providerVoiceId: string, sceneBoundaries: number[], opts: TTSOptions = {}): Promise<TTSResult> {
  if (!env.elevenLabsApiKey) throw new TTSError("La voix off n'est pas configurée (clé ELEVENLABS_API_KEY manquante).", "NOT_CONFIGURED");

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${providerVoiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.elevenLabsApiKey, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: env.elevenLabsModelId,
      voice_settings: {
        stability: opts.stability ?? 0.5,
        similarity_boost: opts.similarity ?? 0.75,
        style: 0.2,
        use_speaker_boost: true,
        speed: opts.speed ?? 1,
      },
      ...(opts.language && env.elevenLabsModelId.includes("turbo") ? { language_code: opts.language } : {}),
    }),
  });

  if (res.status === 401 || res.status === 402) throw new TTSError(`ElevenLabs a rejeté la requête (${res.status}) : ${(await res.text()).slice(0, 300)}`, "QUOTA");
  if (!res.ok) throw new TTSError(`Erreur ElevenLabs ${res.status} : ${(await res.text()).slice(0, 300)}`, "UPSTREAM");

  const data = (await res.json()) as ElevenLabsTimestampResponse;
  const audio = Buffer.from(data.audio_base64, "base64");
  const alignment = data.alignment ?? data.normalized_alignment;

  let wordTimings: WordTiming[];
  let durationMs: number;
  if (alignment && alignment.characters.length) {
    wordTimings = alignmentToWordTimings(alignment.characters, alignment.character_start_times_seconds, alignment.character_end_times_seconds, sceneBoundaries);
    durationMs = Math.round(alignment.character_end_times_seconds[alignment.character_end_times_seconds.length - 1] * 1000) + 300;
  } else {
    wordTimings = estimateWordTimings(text, sceneBoundaries);
    durationMs = wordTimings.length ? wordTimings[wordTimings.length - 1].endMs + 300 : 1000;
  }

  return { audio, mimeType: "audio/mpeg", durationMs, wordTimings, provider: "elevenlabs" };
}

/**
 * Offline fallback used when no TTS key is configured (local dev / demos).
 * Produces a silent WAV of the estimated speech length with estimated word timings,
 * so the full editor → render pipeline stays testable end-to-end.
 */
export function synthesizeOffline(text: string, sceneBoundaries: number[], speed = 1): TTSResult {
  const wordTimings = estimateWordTimings(text, sceneBoundaries, 2.6 * speed);
  const durationMs = (wordTimings.length ? wordTimings[wordTimings.length - 1].endMs : 1000) + 400;
  return { audio: silentWav(durationMs), mimeType: "audio/wav", durationMs, wordTimings, provider: "offline" };
}

export interface VoiceSampleFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/**
 * Instant Voice Cloning: a synchronous ElevenLabs call that returns a usable
 * voice_id immediately (unlike Professional Voice Cloning, which trains for
 * hours) — good enough quality for short-form narration from a couple of
 * minutes of sample audio.
 */
export async function cloneVoice(name: string, files: VoiceSampleFile[]): Promise<{ providerVoiceId: string }> {
  if (!env.elevenLabsApiKey) throw new TTSError("Le clonage de voix n'est pas configuré (clé ELEVENLABS_API_KEY manquante).", "NOT_CONFIGURED");
  if (!files.length) throw new TTSError("Aucun échantillon audio fourni.", "UPSTREAM");

  const form = new FormData();
  form.append("name", name);
  for (const f of files) form.append("files", new Blob([new Uint8Array(f.buffer)], { type: f.mimeType }), f.filename);

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": env.elevenLabsApiKey },
    body: form,
  });
  if (res.status === 401 || res.status === 402) throw new TTSError(`ElevenLabs a rejeté le clonage (${res.status}) : ${(await res.text()).slice(0, 300)}`, "QUOTA");
  if (!res.ok) throw new TTSError(`Erreur ElevenLabs ${res.status} : ${(await res.text()).slice(0, 300)}`, "UPSTREAM");

  const data = (await res.json()) as { voice_id: string };
  return { providerVoiceId: data.voice_id };
}

/** Best-effort cleanup so replacing a clone doesn't leave orphaned voices on the ElevenLabs account. */
export async function deleteClonedVoice(providerVoiceId: string): Promise<void> {
  if (!env.elevenLabsApiKey) return;
  await fetch(`https://api.elevenlabs.io/v1/voices/${providerVoiceId}`, {
    method: "DELETE",
    headers: { "xi-api-key": env.elevenLabsApiKey },
  }).catch(() => undefined);
}

function silentWav(durationMs: number, sampleRate = 22050): Buffer {
  const samples = Math.ceil((durationMs / 1000) * sampleRate);
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}
