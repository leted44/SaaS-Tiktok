import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { localPathFor } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", srt: "text/plain" };

/**
 * Serves files written by the local storage driver with HTTP range support
 * (required for <audio>/<video> seeking and the Remotion renderer).
 * Keys are unguessable (userId + timestamp) so no auth gate is applied — same
 * model as public S3 objects.
 */
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const target = localPathFor(parts.join("/"));
  if (!target) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ext = target.split(".").pop()?.toLowerCase() ?? "";
  const type = MIME[ext] ?? "application/octet-stream";
  const range = req.headers.get("range");
  const headers: Record<string, string> = { "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=31536000, immutable" };

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${stat.size}` } });
    const stream = Readable.toWeb(createReadStream(target, { start, end })) as ReadableStream;
    return new NextResponse(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(createReadStream(target)) as ReadableStream;
  return new NextResponse(stream, { status: 200, headers: { ...headers, "content-length": String(stat.size) } });
}
