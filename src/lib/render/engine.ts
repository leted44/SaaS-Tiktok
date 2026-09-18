import path from "path";
import os from "os";
import { promises as fs } from "fs";
import type { RenderJob } from "@prisma/client";
import { env } from "@/lib/env";
import { putFile, storageKey } from "@/lib/storage";
import { updateRenderProgress } from "@/lib/render/queue";
import { shortVideoPropsSchema, type ShortVideoProps } from "@/lib/render/props";

export interface RenderOutput {
  outputUrl: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  durationMs: number;
}

export interface RenderEngine {
  name: string;
  render(job: RenderJob, props: ShortVideoProps): Promise<RenderOutput>;
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

/**
 * Remotion Lambda engine: offloads rendering to AWS Lambda for horizontal scale.
 * Requires a deployed function + site (`npx remotion lambda functions deploy`,
 * `npx remotion lambda sites create src/remotion/index.ts`). The @remotion/lambda
 * package is loaded dynamically so it stays an optional dependency.
 */
export const lambdaRemotionEngine: RenderEngine = {
  name: "lambda",
  async render(job, props) {
    if (!env.remotion.functionName || !env.remotion.serveUrl) {
      throw new Error("RENDER_ENGINE=lambda requires REMOTION_LAMBDA_FUNCTION_NAME and REMOTION_SERVE_URL");
    }
    const lambdaModule = "@remotion/lambda/client";
    const lambda = (await import(/* webpackIgnore: true */ lambdaModule)) as {
      renderMediaOnLambda: (args: Record<string, unknown>) => Promise<{ renderId: string; bucketName: string }>;
      getRenderProgress: (args: Record<string, unknown>) => Promise<{ done: boolean; overallProgress: number; fatalErrorEncountered: boolean; errors: { message: string }[]; outputFile: string | null; outputSizeInBytes: number | null }>;
    };
    const inputProps = shortVideoPropsSchema.parse(props);

    await updateRenderProgress(job.id, "rendering");
    const { renderId, bucketName } = await lambda.renderMediaOnLambda({
      region: env.remotion.region,
      functionName: env.remotion.functionName,
      serveUrl: env.remotion.serveUrl,
      composition: job.compositionId,
      inputProps,
      codec: "h264",
      crf: 18,
      privacy: "public",
      maxRetries: 2,
      framesPerLambda: 60,
      outName: `${job.id}.mp4`,
    });

    for (;;) {
      await new Promise((r) => setTimeout(r, 2500));
      const progress = await lambda.getRenderProgress({ renderId, bucketName, functionName: env.remotion.functionName, region: env.remotion.region });
      if (progress.fatalErrorEncountered) throw new Error(progress.errors.map((e) => e.message).join("; ") || "Lambda render failed");
      await updateRenderProgress(job.id, "rendering", 25 + progress.overallProgress * 70);
      if (progress.done && progress.outputFile) {
        return { outputUrl: progress.outputFile, thumbnailUrl: null, sizeBytes: progress.outputSizeInBytes ?? 0, durationMs: Math.round((job.durationInFrames / job.fps) * 1000) };
      }
    }
  },
};

export function getRenderEngine(): RenderEngine {
  return env.renderEngine === "lambda" ? lambdaRemotionEngine : localRemotionEngine;
}
