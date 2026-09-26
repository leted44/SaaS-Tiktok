/**
 * Standalone render + publish worker.
 *   npm run worker
 * Polls the database for queued RenderJobs and due PublishJobs. Run one or many
 * instances; job claiming is atomic. Requires Chromium (Remotion downloads it
 * automatically on first run) and the same env as the web app.
 */
import { config } from "dotenv";
config({ path: ".env" });

import { runWorkerTick } from "../src/lib/render/worker";
import { prisma } from "../src/lib/prisma";

const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const IDLE_MS = Number(process.env.WORKER_POLL_MS ?? 4000);
let running = true;

process.on("SIGINT", () => (running = false));
process.on("SIGTERM", () => (running = false));

async function main() {
  console.log(`[${workerId}] started — engine=${process.env.RENDER_ENGINE ?? "local"}`);
  while (running) {
    try {
      const { render, videoClip, published } = await runWorkerTick(workerId);
      if (render) console.log(`[${workerId}] render ${render.jobId} → ${render.status}`);
      if (videoClip) console.log(`[${workerId}] video clip ${videoClip.jobId} → ${videoClip.status}`);
      if (published) console.log(`[${workerId}] published ${published} post(s)`);
      if (!render && !videoClip && !published) await new Promise((r) => setTimeout(r, IDLE_MS));
    } catch (err) {
      console.error(`[${workerId}] tick failed`, err);
      await new Promise((r) => setTimeout(r, IDLE_MS * 2));
    }
  }
  await prisma.$disconnect();
  console.log(`[${workerId}] stopped`);
}

void main();
