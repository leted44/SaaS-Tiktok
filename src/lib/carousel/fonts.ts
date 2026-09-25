import { readFile } from "fs/promises";
import path from "path";

/**
 * The faces the slide renderer knows about.
 *
 * `next/og` draws text with the fonts it is handed and nothing else — no
 * system fonts, no web fonts — so the headline and body faces ship with the
 * app as TTF files and are read once per server instance.
 */
const FILES = [
  { name: "Inter", weight: 400, file: "Inter-Regular.ttf" },
  { name: "Inter", weight: 600, file: "Inter-SemiBold.ttf" },
  { name: "Inter", weight: 800, file: "Inter-ExtraBold.ttf" },
  { name: "Playfair Display", weight: 700, file: "PlayfairDisplay-Bold.ttf" },
  // Condensed poster face of the Immersive template (SIL Open Font License, see Anton-OFL.txt).
  { name: "Anton", weight: 400, file: "Anton-Regular.ttf" },
] as const;

export type LoadedFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700 | 800; style: "normal" };

let cache: Promise<LoadedFont[]> | null = null;

export function loadCarouselFonts(): Promise<LoadedFont[]> {
  if (!cache) {
    const dir = path.join(process.cwd(), "src", "assets", "fonts");
    cache = Promise.all(
      FILES.map(async (f) => {
        const buf = await readFile(path.join(dir, f.file));
        return { name: f.name, weight: f.weight, style: "normal" as const, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
      }),
    ).catch((err) => {
      cache = null;
      throw err;
    });
  }
  return cache;
}
