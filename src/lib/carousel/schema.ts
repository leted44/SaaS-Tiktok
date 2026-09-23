import { z } from "zod";

/**
 * One slide of a carousel.
 *
 * Three kinds, because a carousel has a shape a list of slides would not
 * capture: the cover sells the swipe, the content slides each carry one idea,
 * and the last one asks for the save or the follow.
 */
export const carouselSlideSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["cover", "content", "cta"]),
  kicker: z.string().max(40).default(""),
  title: z.string().max(110),
  body: z.string().max(320).default(""),
});
export type CarouselSlide = z.infer<typeof carouselSlideSchema>;

/**
 * How much text each kind of slide can carry before the layout runs out of
 * room. Measured against the tightest case — the square format — with a margin,
 * so a slide that respects these never overflows in any format.
 */
export const SLIDE_LIMITS: Record<CarouselSlide["kind"], { kicker: number; title: number; body: number }> = {
  cover: { kicker: 32, title: 90, body: 140 },
  content: { kicker: 32, title: 110, body: 320 },
  cta: { kicker: 32, title: 80, body: 180 },
};

export const carouselSlidesSchema = z.array(carouselSlideSchema).min(2).max(12);

export const CAROUSEL_TEMPLATES = ["minimal", "bold", "editorial", "brand"] as const;
export type CarouselTemplate = (typeof CAROUSEL_TEMPLATES)[number];

export const CAROUSEL_FORMATS = ["portrait", "story", "square"] as const;
export type CarouselFormat = (typeof CAROUSEL_FORMATS)[number];

/** Pixel sizes each platform expects. Instagram crops anything taller than 4:5 in the feed. */
export const FORMAT_SIZE: Record<CarouselFormat, { width: number; height: number; label: string; hint: string }> = {
  portrait: { width: 1080, height: 1350, label: "4:5", hint: "Instagram" },
  story: { width: 1080, height: 1920, label: "9:16", hint: "TikTok" },
  square: { width: 1080, height: 1080, label: "1:1", hint: "Carré" },
};

export const carouselStateSchema = z.object({
  template: z.enum(CAROUSEL_TEMPLATES),
  format: z.enum(CAROUSEL_FORMATS),
  handle: z.string().max(40).nullable(),
  slides: carouselSlidesSchema,
});
export type CarouselState = z.infer<typeof carouselStateSchema>;

/**
 * The slide fonts carry no emoji glyphs, so an emoji in the text renders as an
 * empty box. The AI is told not to use them; this removes any that slip
 * through, or that a user types.
 */
export function stripEmoji(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{FE0F}\u{200D}]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Typographic polish applied at render time, never to the stored text.
 *
 * A typewriter apostrophe and a question mark stranded alone on the next line
 * are the two details that make a slide look typed rather than designed. The
 * apostrophe becomes the typographic one, and the space French puts before
 * ? ! : ; becomes non-breaking so the mark always stays with its word.
 */
export function typeset(text: string): string {
  return text
    .replace(/(\w)'(\w)/g, "$1’$2")
    .replace(/'/g, "’")
    .replace(/ ([?!:;»])/g, " $1")
    .replace(/(«) /g, "$1 ");
}
