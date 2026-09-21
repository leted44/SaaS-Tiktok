/**
 * Making a phone's own recordings renderable.
 *
 * A modern Android or iPhone records video as HEVC (H.265), often 10-bit HDR.
 * The phone plays it back flawlessly — it has a hardware decoder for exactly
 * that format — which is why such a file looks perfectly healthy when you open
 * its URL in a browser. The render pipeline is a different matter: Remotion's
 * frame extractor on Lambda has no such decoder, dies on the first frame, and
 * the failure surfaces only as a fetch error against its internal proxy.
 *
 * So the check has to happen here, on the device, before the file is ever
 * uploaded — and the conversion too, for the same reason the playback works:
 * the phone is the one machine that already knows how to read the file.
 */

/**
 * Codecs that must be converted. Deliberately a deny-list, not an allow-list:
 * anything unrecognised is left alone and given the benefit of the doubt, so a
 * container this sniffer simply doesn't understand is never re-encoded — and
 * never degraded — on a guess.
 */
const NEEDS_CONVERSION = new Set(["hvc1", "hev1", "av01"]);

/** Sample-entry fourccs worth recognising, in the order we report them. */
const KNOWN: { fourcc: string; label: string }[] = [
  { fourcc: "hvc1", label: "HEVC (H.265)" },
  { fourcc: "hev1", label: "HEVC (H.265)" },
  { fourcc: "av01", label: "AV1" },
  { fourcc: "vp09", label: "VP9" },
  { fourcc: "avc1", label: "H.264" },
  { fourcc: "avc3", label: "H.264" },
];

export interface VideoProbe {
  /** Null when no known sample entry was found. */
  fourcc: string | null;
  label: string;
  /** False only for a codec positively identified as unreadable by the renderer. */
  renderable: boolean;
}

function findFourcc(bytes: Uint8Array): string | null {
  const text = new TextDecoder("latin1").decode(bytes);
  let best: { fourcc: string; at: number } | null = null;
  for (const { fourcc } of KNOWN) {
    const at = text.indexOf(fourcc);
    // The earliest match wins: a file's own sample entry precedes any
    // compatibility brand a muxer may have listed further in.
    if (at !== -1 && (!best || at < best.at)) best = { fourcc, at };
  }
  return best?.fourcc ?? null;
}

/**
 * Read the codec out of an MP4/QuickTime container without decoding it.
 *
 * Both ends of the file are sampled: a phone writes its index (`moov`, which
 * holds the codec) at the end unless the recording app moved it to the front.
 */
export async function probeVideo(file: File): Promise<VideoProbe> {
  const WINDOW = 256 * 1024;
  const head = new Uint8Array(await file.slice(0, Math.min(WINDOW, file.size)).arrayBuffer());
  let fourcc = findFourcc(head);
  if (!fourcc && file.size > WINDOW) {
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - WINDOW)).arrayBuffer());
    fourcc = findFourcc(tail);
  }
  if (!fourcc) return { fourcc: null, label: "format inconnu", renderable: true };
  return {
    fourcc,
    label: KNOWN.find((k) => k.fourcc === fourcc)?.label ?? fourcc,
    renderable: !NEEDS_CONVERSION.has(fourcc),
  };
}

/** Longest side of the converted file. Renders top out at 1080×1920. */
const MAX_EDGE = 1920;

function pickRecorderMime(): string | null {
  const candidates = [
    'video/mp4;codecs="avc1.4d002a"',
    "video/mp4",
    'video/webm;codecs="vp09.00.10.08"',
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function canConvert(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function" && pickRecorderMime() !== null;
}

/**
 * Re-record a video through the device's own decoder into a format the render
 * pipeline can read, downscaled to the render's own resolution.
 *
 * This plays the file and captures what comes out, so it takes about as long
 * as the clip itself — the cost of using the hardware decoder rather than
 * shipping one. `onProgress` reports 0→1 against the clip's duration.
 */
export async function convertVideo(file: File, onProgress?: (fraction: number) => void): Promise<File> {
  const mimeType = pickRecorderMime();
  if (!mimeType) throw new Error("Ce navigateur ne sait pas convertir de vidéo.");

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  // b-roll is rendered muted, so the audio track is dropped rather than
  // re-encoded — which is also what keeps this to a video-only pipeline.
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Vidéo illisible sur cet appareil."));
    });

    const { videoWidth: w, videoHeight: h, duration } = video;
    if (!w || !h) throw new Error("Dimensions de la vidéo introuvables.");
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Conversion impossible sur cet appareil.");

    const stream = canvas.captureStream(30);
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const done = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("La conversion a été interrompue."));
    });

    recorder.start();
    await video.play();

    // requestVideoFrameCallback fires once per decoded frame, so the capture
    // follows the source's own cadence instead of a timer that can drift.
    await new Promise<void>((resolve) => {
      const draw = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (duration) onProgress?.(Math.min(1, video.currentTime / duration));
        if (video.ended) return resolve();
        if ("requestVideoFrameCallback" in video) {
          (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(draw);
        } else {
          requestAnimationFrame(draw);
        }
      };
      video.onended = () => resolve();
      draw();
    });

    recorder.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());

    const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const type = mimeType.split(";")[0];
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error("La conversion n'a produit aucune donnée.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + `-converti.${ext}`, { type });
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
