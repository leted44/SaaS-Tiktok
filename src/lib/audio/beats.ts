/**
 * Tempo and downbeat detection, in the browser.
 *
 * Runs once when a track is chosen, never during a render: the result is two
 * numbers (a tempo and the offset of the first beat) stored on the project,
 * from which the whole beat grid is derived. That keeps the render path pure
 * and costs nothing per export.
 *
 * The approach is the classic energy-flux one rather than a spectral method:
 * decode, mix to mono, downsample, build an onset envelope from how sharply
 * energy rises, then autocorrelate that envelope to find the period that
 * repeats. It is deliberately modest — it finds the pulse of music that has
 * one, and reports low confidence instead of guessing when it does not.
 */

export interface BeatGrid {
  /** Beats per minute. */
  bpm: number;
  /** Where the first beat falls, in milliseconds from the start of the track. */
  offsetMs: number;
  /** 0–1. Below ACCEPT_CONFIDENCE the track has no pulse clear enough to cut to. */
  confidence: number;
}

/** Analysis sample rate. Beat detection needs the envelope, not fidelity. */
export const ANALYSIS_RATE = 11025;
/** ~11.6 ms per envelope frame — finer than any cut we would make. */
const HOP = 128;
const MIN_BPM = 70;
const MAX_BPM = 180;
/** Below this the pulse is too weak to move anyone's cuts for. */
export const ACCEPT_CONFIDENCE = 0.18;
/**
 * Where "a peak stands out" begins and saturates, measured in robust deviations
 * above the typical lag.
 *
 * Calibrated rather than guessed: across white noise at several levels and
 * speech-like bursts — the realistic false positives — the statistic never rose
 * above 3.5, while a beat still audible under heavy noise scored in the
 * thousands. The floor sits in that gap with room to spare, so an ambiguous
 * track is declined instead of being cut to a pulse that is not there.
 */
const Z_FLOOR = 6;
const Z_SPAN = 14;
/** Analysing more than this is wasted: tempo is established in the first minute. */
const MAX_SECONDS = 90;

type DecodableContext = OfflineAudioContext & { decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> };

function offlineContext(): DecodableContext {
  const Ctor =
    typeof OfflineAudioContext !== "undefined"
      ? OfflineAudioContext
      : (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  return new Ctor(1, ANALYSIS_RATE, ANALYSIS_RATE) as DecodableContext;
}

/** Mix to mono and drop to the analysis rate with a box filter — cheap and sufficient for an envelope. */
function toMonoDownsampled(buffer: AudioBuffer): Float32Array {
  const channels = Math.min(buffer.numberOfChannels, 2);
  const ratio = buffer.sampleRate / ANALYSIS_RATE;
  const sourceLength = Math.min(buffer.length, Math.floor(buffer.sampleRate * MAX_SECONDS));
  const outLength = Math.floor(sourceLength / ratio);
  const out = new Float32Array(outLength);

  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(sourceLength, Math.floor((i + 1) * ratio));
    let sum = 0;
    let n = 0;
    for (let j = start; j < end; j++) {
      for (let c = 0; c < channels; c++) sum += data[c][j];
      n += channels;
    }
    out[i] = n > 0 ? sum / n : 0;
  }
  return out;
}

/** One-pole low-pass, used to isolate the band a kick drum lives in. */
function lowPass(samples: Float32Array, cutoffHz: number): Float32Array {
  const dt = 1 / ANALYSIS_RATE;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = dt / (rc + dt);
  const out = new Float32Array(samples.length);
  let prev = 0;
  for (let i = 0; i < samples.length; i++) {
    prev += alpha * (samples[i] - prev);
    out[i] = prev;
  }
  return out;
}

/**
 * How sharply energy rises, frame by frame.
 *
 * Two bands are summed: the low one carries the kick that most music puts on
 * the beat, the full one catches percussion in tracks that have no bass at all.
 * Only rises count — a beat is an attack, and energy falling away between hits
 * says nothing about where the next one lands.
 */
export function onsetEnvelope(samples: Float32Array): Float32Array {
  const low = lowPass(samples, 200);
  const frames = Math.floor(samples.length / HOP);
  const env = new Float32Array(frames);

  let prevLow = 0;
  let prevFull = 0;
  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    let sumLow = 0;
    let sumFull = 0;
    for (let i = start; i < start + HOP; i++) {
      sumLow += low[i] * low[i];
      sumFull += samples[i] * samples[i];
    }
    const rmsLow = Math.sqrt(sumLow / HOP);
    const rmsFull = Math.sqrt(sumFull / HOP);
    env[f] = Math.max(0, rmsLow - prevLow) * 2 + Math.max(0, rmsFull - prevFull);
    prevLow = rmsLow;
    prevFull = rmsFull;
  }

  // Subtract a moving average so a loud chorus does not outvote a quiet verse.
  const window = 20;
  const flattened = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, f - window); k <= Math.min(frames - 1, f + window); k++) {
      sum += env[k];
      n++;
    }
    flattened[f] = Math.max(0, env[f] - sum / n);
  }
  return flattened;
}

const framesToBpm = (frames: number) => (60 * ANALYSIS_RATE) / (frames * HOP);
const bpmToFrames = (bpm: number) => (60 * ANALYSIS_RATE) / (bpm * HOP);

/**
 * Find the period that repeats, then the phase that lands on the hits.
 *
 * Two things make this harder than a peak-pick over the autocorrelation.
 *
 * The period is almost never a whole number of frames — 128 BPM is 40.37 of
 * them — so the peak is refined between its neighbours, and the comb that
 * searches for the phase steps by that fractional period. Stepping by a whole
 * number instead drifts a little further from the beat on each hit, and by the
 * end of a track the comb is aligned to nothing at all.
 *
 * And the tallest lag is always *something*, noise included: the maximum of
 * sixty random values sits well above their mean. So confidence is measured in
 * standard deviations above the mean rather than as a ratio to it, which is the
 * difference between "this peak stands out" and "this is the biggest of some
 * numbers".
 */
export function estimate(env: Float32Array): BeatGrid | null {
  const minLag = Math.floor(bpmToFrames(MAX_BPM));
  const maxLag = Math.ceil(bpmToFrames(MIN_BPM));
  if (env.length < maxLag * 4) return null;

  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < env.length; i++) sum += env[i] * env[i + lag];
    scores.push(sum / (env.length - lag));
  }
  if (scores.length < 3) return null;

  // Median and MAD, not mean and standard deviation: the autocorrelation of
  // real music peaks at the period *and* at its multiples, and when a multiple
  // falls inside the search range it inflates the spread enough to hide the
  // peak it belongs to. A robust spread describes the lags that are just noise,
  // which is exactly what the peak should be measured against.
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = scores.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  // A sparse envelope — a bare drum loop, say — has a median absolute deviation
  // of exactly zero, because most lags correlate to nothing at all. That is the
  // clearest pulse there is, not a reason to give up, so the spread only ever
  // floors the division. Silence still falls out: its peak equals its median.
  const mad = Math.max(deviations[Math.floor(deviations.length / 2)] * 1.4826, Number.EPSILON);

  // Prefer 90–150 BPM, where a pulse is most legible, without ruling out the rest.
  let bestIdx = 0;
  let bestWeighted = -Infinity;
  for (let i = 0; i < scores.length; i++) {
    const bpm = framesToBpm(minLag + i);
    const weighted = scores[i] * (bpm >= 90 && bpm <= 150 ? 1.15 : 1);
    if (weighted > bestWeighted) {
      bestWeighted = weighted;
      bestIdx = i;
    }
  }

  const z = (scores[bestIdx] - median) / mad;
  const confidence = Math.max(0, Math.min(1, (z - Z_FLOOR) / Z_SPAN));
  if (confidence <= 0) return null;

  // Refine period and phase together, by what they are actually for: the comb
  // that lands hardest on the onsets. Optimising the two separately leaves a
  // period good to about a frame, and a fraction of a frame per beat compounds
  // across a track into a comb aligned to nothing.
  const coarse = minLag + bestIdx;
  let period = coarse;
  let bestOffset = 0;
  let bestScore = -Infinity;
  for (let candidate = coarse - 1; candidate <= coarse + 1; candidate += 0.02) {
    if (candidate < minLag - 1 || candidate <= 1) continue;
    for (let offset = 0; offset < Math.ceil(candidate); offset++) {
      let sum = 0;
      let taps = 0;
      for (let f = offset; f < env.length; f += candidate) {
        sum += env[Math.round(f)];
        taps++;
      }
      const score = taps > 0 ? sum / taps : 0;
      if (score > bestScore) {
        bestScore = score;
        period = candidate;
        bestOffset = offset;
      }
    }
  }
  if (!(period > 0)) return null;

  return {
    bpm: Math.round(framesToBpm(period) * 10) / 10,
    offsetMs: Math.round((bestOffset * HOP * 1000) / ANALYSIS_RATE),
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * The analysis itself, on mono audio already at ANALYSIS_RATE.
 *
 * Split out from decoding so it runs anywhere — the browser path feeds it a
 * decoded track, and it can be exercised directly on a known signal.
 */
export function analysePcm(samples: Float32Array): BeatGrid | null {
  const grid = estimate(onsetEnvelope(samples));
  if (!grid || grid.confidence < ACCEPT_CONFIDENCE) return null;
  return grid;
}

/** Analyse a track. Returns null when the audio has no pulse worth cutting to. */
export async function detectBeatGrid(source: File | Blob | ArrayBuffer): Promise<BeatGrid | null> {
  const bytes = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  const ctx = offlineContext();
  const decoded = await ctx.decodeAudioData(bytes.slice(0));
  return analysePcm(toMonoDownsampled(decoded));
}

/** Fetch and analyse a track already stored — used when music was chosen before this feature existed. */
export async function detectBeatGridFromUrl(url: string): Promise<BeatGrid | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Lecture du fichier audio impossible (${res.status}).`);
  return detectBeatGrid(await res.arrayBuffer());
}
