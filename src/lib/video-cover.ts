import { z } from "zod";

/**
 * The video's cover: one of its own images with a short title over it, as a
 * 1080×1920 picture the creator downloads and sets as the post's cover. In
 * the feed the video plays by itself; the cover is what the creator's
 * profile grid and Instagram's search show, so it is drawn for them.
 *
 * Instagram's profile grid shows a 9:16 cover cut to 3:4 — the middle
 * 1080×1440, from y 240 to 1680 — and TikTok's crops it close to that, so
 * every title position keeps the whole title inside that band.
 */

export const COVER_SIZE = { width: 1080, height: 1920 } as const;

export const COVER_POSITIONS = ["top", "middle", "bottom"] as const;
export type CoverPosition = (typeof COVER_POSITIONS)[number];

export const COVER_POSITION_LABELS: Record<CoverPosition, string> = { top: "Haut", middle: "Milieu", bottom: "Bas" };

/** Where the title block sits, in pixels of the 1920-high cover — always inside the grid's visible band (240 to 1680). */
export const COVER_BLOCK: Record<CoverPosition, { top: number; height: number }> = {
  top: { top: 300, height: 560 },
  middle: { top: 680, height: 560 },
  bottom: { top: 1060, height: 560 },
};

/** The part of the cover a profile grid keeps, as fractions of the height — drawn as a guide on the preview. */
export const GRID_VISIBLE = { top: 240 / 1920, bottom: 1680 / 1920 } as const;

export const COVER_TITLE_MAX = 60;

/** The title faces — the ones the carousel already ships (lib/carousel/fonts), each with the settings it reads best at. */
export const COVER_FONTS = {
  anton: { label: "Affiche", family: "Anton", weight: 400, upper: true, scale: 1, lineHeight: 1.18, gap: 0.22 },
  barlow: { label: "Condensée", family: "Barlow Condensed", weight: 900, upper: true, scale: 1.02, lineHeight: 1.04, gap: 0.2 },
  inter: { label: "Moderne", family: "Inter", weight: 800, upper: false, scale: 0.74, lineHeight: 1.08, gap: 0.26 },
  playfair: { label: "Élégante", family: "Playfair Display", weight: 700, upper: false, scale: 0.8, lineHeight: 1.1, gap: 0.26 },
} as const;
export type CoverFont = keyof typeof COVER_FONTS;
export const COVER_FONT_IDS = Object.keys(COVER_FONTS) as CoverFont[];

/** Light colours only: the title sits on a darkened band of the image, where a dark colour would vanish. */
export const COVER_COLORS = ["#FFFFFF", "#FFF1D6", "#FFD23F", "#FF8A3D", "#FF7AB6", "#5CE1E6", "#7CFF8A"] as const;
export const isCoverColor = (value: string | null | undefined): value is string => /^#[0-9a-fA-F]{6}$/.test(value ?? "");

export const coverTitleSchema = z.object({ title: z.string(), emphasis: z.string().default("") });
export type CoverTitle = z.infer<typeof coverTitleSchema>;
export const coverTitlesSchema = z.array(coverTitleSchema);

// A cover title ends on its last word: a full stop reads as a sentence, not a title.
const firstSentence = (text: string) => (text.trim().split(/(?<=[.!?…])\s+/)[0]?.trim() ?? "").replace(/\.+$/, "");
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * The titles offered for a script's cover: the ones its writer made for the
 * cover, or — on a script written before covers existed — the short lines it
 * already has (the hook's opening sentence, the alternative hooks, its
 * title), so an older video gets a cover without another paid call.
 */
export function coverTitleSuggestions(script: { coverTitles?: CoverTitle[] | null; hook: string; alternativeHooks: string[]; title: string }): CoverTitle[] {
  if (script.coverTitles?.length) return script.coverTitles.slice(0, 3);
  const seen = new Set<string>();
  const out: CoverTitle[] = [];
  for (const line of [script.hook, ...script.alternativeHooks, script.title].map(firstSentence)) {
    const key = line.toLowerCase();
    if (!line || words(line) > 9 || line.length > COVER_TITLE_MAX || seen.has(key)) continue;
    seen.add(key);
    out.push({ title: line, emphasis: "" });
    if (out.length === 3) break;
  }
  return out;
}

/** The title's size on the cover: as big as its length allows, set for Anton's condensed capitals. */
export function coverTitleSize(title: string): number {
  const n = title.trim().length;
  return n <= 14 ? 190 : n <= 22 ? 165 : n <= 30 ? 145 : n <= 40 ? 126 : 108;
}

export function coverFileName(projectTitle: string): string {
  const slug = projectTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `couverture-${slug || "video"}.png`;
}
