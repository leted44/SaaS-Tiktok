import { MPEGDecoder } from "mpg123-decoder";

/**
 * Loudness mastering of a voice-over, the step a sound engineer does before
 * a voice goes out: bring the speech to a broadcast level, then make sure no
 * peak clips.
 *
 * A real export measured its speech around -18 dBFS, where short-form videos
 * usually sit near -14 LUFS — next to them in a feed, a VidiSprint video
 * sounded quieter and weaker. Raising the volume in the renderer alone would
 * clip: the voice's peaks were already around -4 dBFS. So the gain is
 * applied here, sample by sample, behind a look-ahead limiter.
 *
 * The speech level is measured on the frames that carry speech (silence
 * gated out), the usual proxy for loudness in LUFS on dry speech — within a
 * dB or two. The result is an uncompressed WAV: re-encoding to MP3 would
 * cost quality for a file this small (about 2.6 MB for 30 s).
 */

/** Speech level the voice is brought to, in dBFS RMS over its spoken parts — about -14 LUFS, the level social platforms play at. */
const TARGET_DBFS = -14;
/** No sample above this after limiting. */
const CEILING_DBFS = -1;
/** Never raise or lower by more than this, in case the measurement meets something unusual (near-silence, noise). */
const MAX_GAIN_DB = 18;
const MIN_GAIN_DB = -12;

const dbToGain = (db: number) => 10 ** (db / 20);

export interface MasteredVoice {
  audio: Buffer;
  mimeType: "audio/wav";
  /** Gain applied before limiting, in dB. */
  gainDb: number;
  /** Speech level measured before mastering, in dBFS. */
  speechDb: number;
}

/** Decode an MP3 voice-over, master it, and return it as WAV — or null when it cannot be decoded, so the original is kept. */
export async function masterVoiceMp3(mp3: Buffer): Promise<MasteredVoice | null> {
  const decoder = new MPEGDecoder();
  try {
    await decoder.ready;
    const decoded = decoder.decode(new Uint8Array(mp3));
    if (!decoded.samplesDecoded || !decoded.channelData.length) return null;
    const mono = downmix(decoded.channelData, decoded.samplesDecoded);
    const mastered = masterPcm(mono, decoded.sampleRate);
    if (!mastered) return null;
    return { audio: encodeWav(mastered.samples, decoded.sampleRate), mimeType: "audio/wav", gainDb: mastered.gainDb, speechDb: mastered.speechDb };
  } catch (err) {
    console.error("[voice-master] could not master the voice-over, keeping the original:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    decoder.free();
  }
}

function downmix(channels: Float32Array[], length: number): Float32Array {
  if (channels.length === 1) return channels[0].subarray(0, length);
  const out = new Float32Array(length);
  for (const ch of channels) for (let i = 0; i < length; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Speech level in dBFS: RMS over the 50 ms frames louder than -45 dBFS. Null when there is no speech at all. */
export function speechLevelDb(samples: Float32Array, sampleRate: number): number | null {
  const frame = Math.max(1, Math.round(sampleRate * 0.05));
  const gate = dbToGain(-45) ** 2;
  let energy = 0;
  let frames = 0;
  for (let start = 0; start + frame <= samples.length; start += frame) {
    let sum = 0;
    for (let i = start; i < start + frame; i++) sum += samples[i] * samples[i];
    const mean = sum / frame;
    if (mean > gate) {
      energy += mean;
      frames++;
    }
  }
  return frames ? 10 * Math.log10(energy / frames) : null;
}

/**
 * Gain to the target, then a look-ahead peak limiter: the gain each sample
 * needs to stay under the ceiling, reduced to its minimum over the next few
 * milliseconds and averaged over the same window — so the reduction is fully
 * in place when the peak arrives, with no step that would click — then
 * released slowly enough not to pump.
 */
export function masterPcm(samples: Float32Array, sampleRate: number): { samples: Float32Array; gainDb: number; speechDb: number } | null {
  const speechDb = speechLevelDb(samples, sampleRate);
  if (speechDb === null) return null;
  const gainDb = Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, TARGET_DBFS - speechDb));
  const gain = dbToGain(gainDb);
  const ceiling = dbToGain(CEILING_DBFS);
  const n = samples.length;

  const needed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const level = Math.abs(samples[i]) * gain;
    needed[i] = level > ceiling ? ceiling / level : 1;
  }

  const look = Math.max(1, Math.round(sampleRate * 0.005));
  const ahead = slidingMinForward(needed, look);
  const smoothed = movingAverageBackward(ahead, look);

  const release = 1 - Math.exp(-1 / (sampleRate * 0.08));
  const out = new Float32Array(n);
  let current = 1;
  for (let i = 0; i < n; i++) {
    const target = smoothed[i];
    current = target < current ? target : current + (target - current) * release;
    out[i] = Math.max(-ceiling, Math.min(ceiling, samples[i] * gain * current));
  }
  return { samples: out, gainDb, speechDb };
}

/** out[i] = min(values[i .. i + window - 1]), in linear time. */
function slidingMinForward(values: Float32Array, window: number): Float32Array {
  const n = values.length;
  const out = new Float32Array(n);
  const deque = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && values[deque[tail - 1]] >= values[i]) tail--;
    deque[tail++] = i;
    while (deque[head] > i + window - 1) head++;
    out[i] = values[deque[head]];
  }
  return out;
}

/** out[i] = mean(values[i - window + 1 .. i]), clamped at the start. */
function movingAverageBackward(values: Float32Array, window: number): Float32Array {
  const out = new Float32Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out[i] = sum / Math.min(i + 1, window);
  }
  return out;
}

/** 16-bit mono PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataSize = samples.length * 2;
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
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

