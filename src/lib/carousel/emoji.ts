import { readFile } from "fs/promises";
import path from "path";

/**
 * Emoji in the slide images.
 *
 * `next/og` draws an emoji by fetching its Twemoji picture from a CDN at
 * render time — a slide would then depend on that CDN answering, and fail
 * when it does not. The emoji a carousel actually uses (food, body, sport,
 * health, arrows, hands, faces, checks…) ship with the app instead
 * (src/assets/emoji/twemoji, Twemoji, CC-BY 4.0): a request for one of those
 * is answered from disk, any other still goes to the CDN.
 *
 * It works by answering those requests in `fetch` itself, the only hook
 * `next/og` leaves; every other request goes through untouched.
 */

const CDN = "https://cdn.jsdelivr.net/gh/twitter/twemoji@";
const DIR = path.join(process.cwd(), "src", "assets", "emoji", "twemoji");

let installed = false;

export function installBundledEmoji(): void {
  if (installed) return;
  installed = true;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(CDN)) {
      const file = url.split("/").pop() ?? "";
      if (/^[0-9a-f-]+\.svg$/.test(file)) {
        const svg = await readFile(path.join(DIR, file)).catch(() => null);
        if (svg) return new Response(new Uint8Array(svg), { headers: { "content-type": "image/svg+xml" } });
      }
    }
    return original(input, init);
  }) as typeof fetch;
}
