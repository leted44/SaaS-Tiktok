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
  /** Last slide only: the explicit ask — follow, comment a keyword, share. */
  action: z.string().max(90).default(""),
  /** Search words for a matching photo, written by the AI. Pre-fills the image search. */
  imageQuery: z.string().max(80).default(""),
  /** A photo behind the cover or above a content slide. Always a copy in our own storage. */
  image: z.object({ url: z.string().min(1).max(600) }).nullable().default(null),
});
export type CarouselSlide = z.infer<typeof carouselSlideSchema>;

/**
 * How much text each kind of slide can carry before the layout runs out of
 * room. Measured against the tightest case — the square format — with a margin,
 * so a slide that respects these never overflows in any format.
 */
export const SLIDE_LIMITS: Record<CarouselSlide["kind"], { kicker: number; title: number; body: number; action: number }> = {
  cover: { kicker: 32, title: 90, body: 140, action: 0 },
  content: { kicker: 32, title: 110, body: 320, action: 0 },
  cta: { kicker: 32, title: 70, body: 140, action: 90 },
};

/**
 * Tighter limits for a content slide that carries a photo: the photo takes a
 * third of the height, so the text has to give up the same room.
 */
export const IMAGE_SLIDE_LIMITS = { title: 80, body: 200 };

export function limitsFor(slide: Pick<CarouselSlide, "kind" | "image">) {
  const base = SLIDE_LIMITS[slide.kind];
  return slide.kind === "content" && slide.image ? { ...base, ...IMAGE_SLIDE_LIMITS } : base;
}

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
 * ? ! : ; becomes non-breaking so the mark always stays with its word, as does
 * the space between a number and its unit.
 */
export function typeset(text: string): string {
  return text
    .replace(/(\w)'(\w)/g, "$1\u2019$2")
    .replace(/'/g, "\u2019")
    .replace(/ ([?!:;»])/g, "\u00A0$1")
    .replace(/(«) /g, "$1\u00A0")
    // "7 jours", "2 minutes": a number never ends a line apart from its unit.
    .replace(/(\d) (\p{L})/gu, "$1\u00A0$2");
}
