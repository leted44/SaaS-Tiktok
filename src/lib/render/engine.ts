import path from "path";
import os from "os";
import { promises as fs } from "fs";
import type { RenderJob } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { putFile, storageKey } from "@/lib/storage";
import { updateRenderProgress } from "@/lib/render/queue";
import { shortVideoPropsSchema, type ShortVideoProps } from "@/lib/render/props";

export interface RenderOutput {
  outputUrl: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  durationMs: number;
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

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clipforge-"));
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
      crf: 18,
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
    const lambdaModule = "@remotion/lambda/client";
    const lambda = (await import(/* webpackIgnore: true */ lambdaModule)) as {
      renderMediaOnLambda: (args: Record<string, unknown>) => Promise<{ renderId: string; bucketName: string }>;
      getRenderProgress: (args: Record<string, unknown>) => Promise<{ done: boolean; overallProgress: number; fatalErrorEncountered: boolean; errors: { message: string }[]; outputFile: string | null; outputSizeInBytes: number | null }>;
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
        crf: 18,
        privacy: "public",
        maxRetries: 1,
        // Chunk size trades two failure modes against each other: too many chunks
        // trips a new AWS account's low concurrency quota, too few makes a single
        // chunk outlast the function timeout. ~6 chunks for a 35s video sits between.
        framesPerLambda: 200,
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
        return { outputUrl: progress.outputFile, thumbnailUrl: null, sizeBytes: progress.outputSizeInBytes ?? 0, durationMs: Math.round((job.durationInFrames / job.fps) * 1000) };
      }
      if (Date.now() >= deadline) return null;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  },
};

export function getRenderEngine(): RenderEngine {
  return env.renderEngine === "lambda" ? lambdaRemotionEngine : localRemotionEngine;
}
