import { z } from "zod";
import { slugify } from "@/lib/utils";
import { VISUAL_STYLES, aiSource, isAiSource, type VisualLayout, type VisualStyle } from "@/lib/carousel/art-direction";

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
  /** The scene an AI visual depicts for this slide — written by the AI, editable. Style and framing are added separately. */
  imagePrompt: z.string().max(600).default(""),
  /** The one to three words of the title set in the accent colour — the punch of the line. */
  emphasis: z.string().max(60).default(""),
  /**
   * A photo behind the cover or above a content slide. Always a copy in our own
   * storage. `source` is the stock photo it was copied from, so filling the empty
   * slides never puts the same photo on two of them.
   */
  image: z.object({ url: z.string().min(1).max(600), source: z.string().max(600).optional() }).nullable().default(null),
  /** Stock photos the user took off this slide — "Remplir" never proposes them again. */
  rejectedImages: z.array(z.string().max(600)).max(40).optional(),
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

/** A content slide whose text would be cut by the room an image takes. */
export function tooLongForImage(slide: Pick<CarouselSlide, "kind" | "title" | "body">): boolean {
  return slide.kind === "content" && (slide.title.length > IMAGE_SLIDE_LIMITS.title || slide.body.length > IMAGE_SLIDE_LIMITS.body);
}

/** Where a slide's image came from, for the editor's labels. */
export function imageOrigin(image: CarouselSlide["image"]): "ai" | "stock" | "upload" | null {
  if (!image) return null;
  // The first AI images were stored without a source; their file name still says what they are.
  if (isAiSource(image.source) || (!image.source && image.url.includes("-carousel-ai-"))) return "ai";
  return image.source ? "stock" : "upload";
}

/**
 * Whether a slide still needs an AI visual in this style: it has no image, a
 * stock photo (the mix of sources is what breaks a series), or an AI image
 * made in another style. A photo the user uploaded themselves is theirs and
 * is never replaced.
 */
export function needsAiVisual(slide: CarouselSlide, style: VisualStyle): boolean {
  if (slide.kind === "cta") return false;
  const origin = imageOrigin(slide.image);
  if (origin === null || origin === "stock") return true;
  return origin === "ai" && slide.image!.source !== aiSource(style);
}

export const carouselSlidesSchema = z.array(carouselSlideSchema).min(2).max(12);

export const CAROUSEL_TEMPLATES = ["immersive", "minimal", "bold", "editorial", "brand"] as const;
export type CarouselTemplate = (typeof CAROUSEL_TEMPLATES)[number];

/**
 * How a slide's image is laid out: the cover is always full-bleed; content
 * slides are full-bleed in the Immersive template and a band elsewhere.
 */
export function imageLayout(kind: CarouselSlide["kind"], template: CarouselTemplate): VisualLayout {
  return kind === "cover" || template === "immersive" ? "bleed" : "band";
}

export const CAROUSEL_FORMATS = ["portrait", "story", "square"] as const;
export type CarouselFormat = (typeof CAROUSEL_FORMATS)[number];

/** Pixel sizes each platform expects. Instagram crops anything taller than 4:5 in the feed. */
export const FORMAT_SIZE: Record<CarouselFormat, { width: number; height: number; label: string; hint: string }> = {
  portrait: { width: 1080, height: 1350, label: "4:5", hint: "Instagram" },
  story: { width: 1080, height: 1920, label: "9:16", hint: "TikTok" },
  square: { width: 1080, height: 1080, label: "1:1", hint: "Carré" },
};

/**
 * The aspect ratio to generate an image at, so it fills its frame without
 * losing the subject to cropping. A band is roughly as wide as the slide's
 * text column and a third of its height; each maps to the nearest ratio the
 * image model supports.
 */
export function imageAspect(layout: VisualLayout, format: CarouselFormat): "1:1" | "4:5" | "9:16" | "16:9" | "5:4" | "21:9" {
  if (layout === "bleed") return FORMAT_SIZE[format].label as "1:1" | "4:5" | "9:16";
  return format === "story" ? "5:4" : format === "square" ? "21:9" : "16:9";
}

export const carouselStateSchema = z.object({
  template: z.enum(CAROUSEL_TEMPLATES),
  format: z.enum(CAROUSEL_FORMATS),
  handle: z.string().max(40).nullable(),
  slides: carouselSlidesSchema,
  /** Art direction every AI visual of this carousel is generated in. Null until AI visuals are used. */
  visualStyle: z.enum(VISUAL_STYLES).nullable().default(null),
  /** The recurring setting that ties the images together as one series. */
  visualMotif: z.string().max(300).default(""),
});
export type CarouselState = z.infer<typeof carouselStateSchema>;

/** The stored row, read as editor state. An unknown style (a preset since removed) reads as none rather than failing the whole carousel. */
export function carouselStateFromRow(row: { template: string; format: string; handle: string | null; slides: unknown; visualStyle?: string | null; visualMotif?: string | null }) {
  const visualStyle = (VISUAL_STYLES as readonly string[]).includes(row.visualStyle ?? "") ? row.visualStyle : null;
  return carouselStateSchema.safeParse({ template: row.template, format: row.format, handle: row.handle, slides: row.slides, visualStyle, visualMotif: row.visualMotif ?? "" });
}

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
 * A filename-safe slug from the project title, so downloaded slides from two
 * different carousels never collide — without this, every project's files
 * were all named `slide-01.png`, and a second project's download silently
 * overwrote the first's still sitting in the phone's Downloads folder.
 */
export function slideFileSlug(title: string): string {
  return slugify(title).slice(0, 40).replace(/-+$/, "") || "carrousel";
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
