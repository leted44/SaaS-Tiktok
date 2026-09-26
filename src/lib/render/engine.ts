import path from "path";
import os from "os";
import { promises as fs } from "fs";
import type { RenderJob } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { putFile, storageKey } from "@/lib/storage";
import { updateRenderProgress } from "@/lib/render/queue";
import { shortVideoPropsSchema, type ShortVideoProps } from "@/lib/render/props";

/** Where a Lambda render actually spent its time, as reported by Remotion itself. */
export interface RenderTimings {
  totalMs: number | null;
  renderFramesMs: number | null;
  encodeMs: number | null;
  combineMs: number | null;
  chunks: number;
  lambdasInvoked: number;
  retries: number;
  /** Frame range that took longest, which is what sets the wall-clock time. */
  slowestChunk: { frames: [number, number]; ms: number } | null;
}

export interface RenderOutput {
  outputUrl: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  durationMs: number;
  timings?: RenderTimings;
}

export interface RenderOptions {
  /**
   * How long this call may keep polling a remote render before giving up and
   * letting a later call resume. Zero means check once and return — what the
   * studio's own 3-second progress polling passes, so a browser tab can drive
   * a render forward without blocking on each request.
   */
  pollBudgetMs?: number;
}

export interface RenderEngine {
  name: string;
  /** Returns null when the render is still in progress and should be checked again later. */
  render(job: RenderJob, props: ShortVideoProps, opts?: RenderOptions): Promise<RenderOutput | null>;
}

/**
 * Encoding settings shared by both engines. CRF 21 with the `faster` x264 preset
 * is a deliberate trade: every target platform (TikTok, Reels, Shorts) re-encodes
 * the upload anyway, so the extra bitrate and encoder passes that CRF 18 at the
 * `medium` preset buys are thrown away downstream while costing render time on
 * every single chunk.
 */
const SOCIAL_CRF = 21;
const SOCIAL_X264_PRESET = "faster" as const;

let cachedBundle: { serveUrl: string; builtAt: number } | null = null;

/**
 * Local engine: bundles the Remotion project once per process and renders with
 * @remotion/renderer (headless Chromium). Intended for the standalone worker
 * (`npm run worker`) or any long-running Node host — not for serverless.
 */
export const localRemotionEngine: RenderEngine = {
  name: "local",
  async render(job, props) {
    const { bundle } = await import("@remotion/bundler");
    const { renderMedia, renderStill, selectComposition } = await import("@remotion/renderer");

    await updateRenderProgress(job.id, "bundling");
    if (!cachedBundle || Date.now() - cachedBundle.builtAt > 60 * 60 * 1000) {
      const serveUrl = await bundle({
        entryPoint: path.join(process.cwd(), "src", "remotion", "index.ts"),
        webpackOverride: (config) => ({
          ...config,
          resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.join(process.cwd(), "src") } },
        }),
      });
      cachedBundle = { serveUrl, builtAt: Date.now() };
    }

    const inputProps = shortVideoPropsSchema.parse(props);
    const composition = await selectComposition({ serveUrl: cachedBundle.serveUrl, id: job.compositionId, inputProps, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vidisprint-"));
    const outPath = path.join(tmpDir, `${job.id}.mp4`);
    const thumbPath = path.join(tmpDir, `${job.id}.jpg`);

    // Optional: point Remotion at an existing Chromium instead of downloading Chrome Headless Shell.
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;

    await updateRenderProgress(job.id, "rendering");
    await renderMedia({
      browserExecutable,
      composition: { ...composition, width: job.width, height: job.height, fps: job.fps, durationInFrames: job.durationInFrames },
      serveUrl: cachedBundle.serveUrl,
      codec: "h264",
      outputLocation: outPath,
      inputProps,
      crf: SOCIAL_CRF,
      x264Preset: SOCIAL_X264_PRESET,
      audioBitrate: "192k",
      chromiumOptions: { gl: "angle" },
      onProgress: ({ progress }) => {
        void updateRenderProgress(job.id, "rendering", 25 + progress * 63);
      },
    });

    await updateRenderProgress(job.id, "encoding");
    await renderStill({
      browserExecutable,
      composition: { ...composition, width: job.width, height: job.height, fps: job.fps, durationInFrames: job.durationInFrames },
      serveUrl: cachedBundle.serveUrl,
      output: thumbPath,
      inputProps,
      frame: Math.min(job.durationInFrames - 1, Math.round(job.fps * 1.2)),
      imageFormat: "jpeg",
      jpegQuality: 85,
    });

    await updateRenderProgress(job.id, "uploading");
    const video = await putFile(storageKey(job.userId, "video", `${job.id}.mp4`), outPath, "video/mp4");
    const thumb = await putFile(storageKey(job.userId, "thumb", `${job.id}.jpg`), thumbPath, "image/jpeg");
    await fs.rm(tmpDir, { recursive: true, force: true });

    return { outputUrl: video.url, thumbnailUrl: thumb.url, sizeBytes: video.sizeBytes, durationMs: Math.round((job.durationInFrames / job.fps) * 1000) };
  },
};

interface LambdaRenderState {
  renderId: string;
  bucketName: string;
}

/** The subset of Remotion's progress payload this engine reads. */
interface LambdaProgress {
  done: boolean;
  overallProgress: number;
  fatalErrorEncountered: boolean;
  errors: { message: string }[];
  outputFile: string | null;
  outputSizeInBytes: number | null;
  timeToFinish: number | null;
  timeToRenderFrames: number | null;
  timeToEncode: number | null;
  timeToCombine: number | null;
  chunks: number;
  lambdasInvoked: number;
  retriesInfo: unknown[];
  mostExpensiveFrameRanges: { frameRange: [number, number]; timeInMilliseconds: number }[] | null;
}

function readTimings(progress: LambdaProgress): RenderTimings {
  const slowest = progress.mostExpensiveFrameRanges?.[0] ?? null;
  return {
    totalMs: progress.timeToFinish,
    renderFramesMs: progress.timeToRenderFrames,
    encodeMs: progress.timeToEncode,
    combineMs: progress.timeToCombine,
    chunks: progress.chunks,
    lambdasInvoked: progress.lambdasInvoked,
    retries: progress.retriesInfo?.length ?? 0,
    slowestChunk: slowest ? { frames: slowest.frameRange, ms: slowest.timeInMilliseconds } : null,
  };
}

/**
 * True when a render's own visuals depend on this app's storage rather than a
 * CDN.
 *
 * Remotion downloads a video/image source in full — once per Lambda
 * invocation, not once per render (@remotion/renderer's downloadMap is
 * per-process, and each chunk runs in its own isolated Lambda). A clip
 * spanning N chunks is downloaded by Supabase Storage N times, concurrently:
 * a plain storage bucket, not a video CDN, and that concurrency is what a
 * render kept failing on even after the per-frame retry in VisualLayers.tsx —
 * the same fetch failed on every retry because every retry still competed
 * with the other chunks hammering the same object. Pexels' CDN absorbs this
 * without trouble, which is why only uploads were affected.
 */
function hasOwnStorageVisual(props: ShortVideoProps): boolean {
  const ownHost = safeHost(env.s3.publicUrl) ?? safeHost(env.s3.endpoint);
  if (!ownHost) return false;
  return props.visualLayers.some((l) => (l.type === "video" || l.type === "image") && safeHost(l.src) === ownHost);
}

function safeHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * A still frame from just after the hook, so a project's card in the
 * dashboard/exports shows the actual video instead of a brand-colour
 * placeholder — the first thing a viewer would see is also what should sell
 * the click when this gets published. Best-effort: the main render already
 * succeeded by the time this runs, and a failed thumbnail should never turn
 * that into a failed render or a refund.
 */
async function renderLambdaThumbnail(
  lambda: { renderStillOnLambda: (args: Record<string, unknown>) => Promise<{ url: string }> },
  job: RenderJob,
  props: ShortVideoProps,
): Promise<string | null> {
  try {
    const still = await lambda.renderStillOnLambda({
      region: env.remotion.region,
      functionName: env.remotion.functionName,
      serveUrl: env.remotion.serveUrl,
      composition: job.compositionId,
      forceWidth: job.width,
      forceHeight: job.height,
      forceFps: job.fps,
      forceDurationInFrames: job.durationInFrames,
      inputProps: shortVideoPropsSchema.parse(props),
      imageFormat: "jpeg",
      jpegQuality: 85,
      frame: Math.min(job.durationInFrames - 1, Math.round(job.fps * 1.2)),
      privacy: "public",
      outName: `${job.id}-thumb.jpg`,
    });
    return still.url;
  } catch {
    return null;
  }
}

const POLL_INTERVAL_MS = 3000;
/** Safely under any realistic serverless function timeout (Vercel Hobby caps around 60s). */
const POLL_BUDGET_MS = 45_000;

/**
 * Remotion Lambda engine: offloads rendering to AWS Lambda for horizontal scale.
 * Requires a deployed function + site (`npx remotion lambda functions deploy`,
 * `npx remotion lambda sites create src/remotion/index.ts`). The @remotion/lambda
 * package is loaded dynamically so it stays an optional dependency.
 *
 * Starting a render and waiting for it to finish are split across separate calls
 * (persisted in `job.logs`) instead of blocking inside one invocation: a Vercel
 * serverless function can be killed well before a render completes, and looping
 * `renderMediaOnLambda` again on the next tick would start a second render on top
 * of the first, stacking concurrent Lambda invocations until AWS rate-limits them.
 */
export const lambdaRemotionEngine: RenderEngine = {
  name: "lambda",
  async render(job, props, opts) {
    if (!env.remotion.functionName || !env.remotion.serveUrl) {
      throw new Error("RENDER_ENGINE=lambda requires REMOTION_LAMBDA_FUNCTION_NAME and REMOTION_SERVE_URL");
    }
    // Imported by its literal specifier, not through a variable with
    // webpackIgnore: hiding it from the bundler also hides it from Next's
    // dependency tracing, so the package never got copied into the serverless
    // function and the import failed at runtime. It is marked external in
    // next.config instead, which keeps it out of the bundle but still traced.
    // Loose types because the real ones want narrower unions (AwsRegion) than
    // the env config carries.
    const lambda = (await import("@remotion/lambda/client")) as unknown as {
      renderMediaOnLambda: (args: Record<string, unknown>) => Promise<{ renderId: string; bucketName: string }>;
      getRenderProgress: (args: Record<string, unknown>) => Promise<LambdaProgress>;
      renderStillOnLambda: (args: Record<string, unknown>) => Promise<{ url: string }>;
    };

    const state = job.logs as unknown as LambdaRenderState | null;
    let renderId: string;
    let bucketName: string;

    if (state?.renderId && state?.bucketName) {
      renderId = state.renderId;
      bucketName = state.bucketName;
    } else {
      const inputProps = shortVideoPropsSchema.parse(props);
      await updateRenderProgress(job.id, "rendering", 25);
      const started = await lambda.renderMediaOnLambda({
        region: env.remotion.region,
        functionName: env.remotion.functionName,
        serveUrl: env.remotion.serveUrl,
        composition: job.compositionId,
        inputProps,
        codec: "h264",
        crf: SOCIAL_CRF,
        x264Preset: SOCIAL_X264_PRESET,
        privacy: "public",
        // A chunk that still fails after OffthreadVideo/Img already retried the
        // fetch internally (see VisualLayers.tsx) is worth one more full attempt
        // — a fresh Lambda invocation is a fresh network path — before giving up
        // and refunding the user's credits.
        maxRetries: 2,
        // Left unset (Remotion's own ~20-frame default, ~51 chunks for a 34s
        // video) so scenes stay parallel and fast — that default is what fixed
        // the earlier measured 317s bottleneck from one expensive scene held
        // inside a 200-frame chunk. Widened only when an uploaded visual is
        // present, trading some of that speed for fewer chunks independently
        // fetching the same Supabase-hosted file — see hasOwnStorageVisual above.
        //
        // 150 was too wide: a real render on 8×150-frame chunks hit the
        // function's own 400s ceiling with 5 of 8 chunks still unfinished —
        // framesPerLambda widens every chunk in the render, not just the one
        // overlapping the uploaded clip, so it multiplied by eight the one
        // thing this was meant to shrink. 50 still roughly halves the
        // concurrent downloads of the same file (about 3 chunks touch a
        // typical clip instead of up to 9), while keeping any one chunk's
        // total work — its own download plus decode — small next to 400s.
        framesPerLambda: hasOwnStorageVisual(props) ? 50 : undefined,
        outName: `${job.id}.mp4`,
      });
      renderId = started.renderId;
      bucketName = started.bucketName;
      await prisma.renderJob.update({ where: { id: job.id }, data: { logs: { renderId, bucketName } } });
      // Falls through into the poll loop below instead of returning here: the
      // external cron only ticks once a minute, so stopping now would throw
      // away up to a full minute of dead time before the first status check,
      // even for a render that finishes well inside this invocation's budget.
    }

    // Poll in a short loop, bounded well under any serverless function time
    // limit, and let a later call pick up where this one left off if the
    // render is still going after the budget.
    const deadline = Date.now() + (opts?.pollBudgetMs ?? POLL_BUDGET_MS);
    for (;;) {
      const progress = await lambda.getRenderProgress({ renderId, bucketName, functionName: env.remotion.functionName, region: env.remotion.region });
      if (progress.fatalErrorEncountered) throw new Error(progress.errors.map((e) => e.message).join("; ") || "Lambda render failed");
      await updateRenderProgress(job.id, "rendering", 25 + progress.overallProgress * 70);
      if (progress.done && progress.outputFile) {
        return {
          outputUrl: progress.outputFile,
          thumbnailUrl: await renderLambdaThumbnail(lambda, job, props),
          sizeBytes: progress.outputSizeInBytes ?? 0,
          durationMs: Math.round((job.durationInFrames / job.fps) * 1000),
          timings: readTimings(progress),
        };
      }
      if (Date.now() >= deadline) return null;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  },
};

export function getRenderEngine(): RenderEngine {
  return env.renderEngine === "lambda" ? lambdaRemotionEngine : localRemotionEngine;
}
