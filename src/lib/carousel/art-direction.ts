/**
 * Art direction for AI-generated carousel visuals.
 *
 * A carousel that looks designed is one where every image obviously belongs
 * to the same series: same light, same palette, same lens, same recurring
 * setting. Left to itself, an image model picks a new look for every prompt,
 * and eight slides come out as eight unrelated pictures. So the look is
 * chosen once per carousel — one of these presets — and written into every
 * prompt verbatim, while the scene alone changes from slide to slide.
 */

export const VISUAL_STYLES = ["cinematic", "studio", "noir", "illustration", "pastel"] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];

export const DEFAULT_VISUAL_STYLE: VisualStyle = "cinematic";

export interface ArtDirection {
  label: string;
  hint: string;
  /** Written into every image prompt of the carousel. English: image models follow it most reliably. */
  prompt: string;
  /** Three colours that preview the look in the picker. */
  swatch: [string, string, string];
}

export const ART_DIRECTIONS: Record<VisualStyle, ArtDirection> = {
  cinematic: {
    label: "Cinématique",
    hint: "Lumière dorée, ambiance chaude",
    prompt:
      "Cinematic editorial photograph. Warm golden-hour backlight with soft glowing highlights, rich warm colour grade (amber, honey, deep brown), creamy bokeh background, shallow depth of field, 85mm lens look, subtle film grain. Moody, premium and inviting.",
    swatch: ["#2A1A0E", "#C8873A", "#F3D9A4"],
  },
  studio: {
    label: "Studio",
    hint: "Lumineux, net, magazine",
    prompt:
      "Premium magazine studio photograph. Bright soft diffused key light, subtle natural shadows, clean seamless light neutral backdrop, crisp detail, true-to-life colours, minimal props, generous negative space.",
    swatch: ["#EDEAE4", "#FFFFFF", "#9A9186"],
  },
  noir: {
    label: "Contraste",
    hint: "Fond noir, lumière dramatique",
    prompt:
      "Low-key dramatic photograph. A single directional light carving the subject out of a deep black background, strong contrast, glossy highlights, rich saturated subject colours, fine detail, luxurious mood.",
    swatch: ["#050505", "#3A2A1F", "#E8B04A"],
  },
  illustration: {
    label: "Illustration 3D",
    hint: "Film d'animation, chaleureux",
    prompt:
      "High-end stylised 3D animated feature-film still. Soft cinematic lighting with a warm rim light, smooth rounded shapes, expressive and friendly characters, rich warm palette, subsurface scattering, detailed textures, shallow depth of field.",
    swatch: ["#3B2418", "#F08A5D", "#FFD6A5"],
  },
  pastel: {
    label: "Doux",
    hint: "Pastel, lumière du jour",
    prompt:
      "Airy lifestyle photograph. Soft natural window daylight, pastel palette (blush, sage, cream), light and fresh mood, gentle shadows, clean uncluttered composition, delicate details.",
    swatch: ["#F4E7E1", "#C9D8C5", "#FFFFFF"],
  },
};

/**
 * Where the image sits on the slide decides how it must be framed: text is
 * laid over the lower part of a full-bleed image, while a band is a wide strip
 * above the text. An image composed for the wrong one gets its subject cropped
 * or buried under the headline.
 */
export type VisualLayout = "bleed" | "band" | "frame";

const COMPOSITION: Record<VisualLayout, string> = {
  bleed:
    "Vertical composition: place the main subject in the upper 60% of the frame, and keep the bottom third simple, darker and uncluttered — a headline will be laid over it.",
  band: "Wide horizontal composition: centre the subject with generous margins, nothing important near the edges.",
  // A video scene: captions can land anywhere over it, not a fixed text band,
  // so nothing is reserved — the photo is the whole frame, not a subject
  // floating over empty space the way "bleed" deliberately leaves for a slide.
  frame: "Fill the entire frame edge to edge with the subject and scene — no empty, plain or simplified area anywhere, nothing reserved for text.",
};

/**
 * Failure modes common enough in image models to rule out in every prompt —
 * none can be detected reliably from the pixels afterwards. Text and digits
 * come out garbled, and hands grow extra fingers.
 */
const RULES =
  "Absolutely no text, letters, numbers, logos, watermarks, captions, signage, screens or clock faces anywhere in the image. No close-up of hands or fingers. Anatomically correct people. One clear focal subject, sharp focus on it.";

export function composeImagePrompt(input: { scene: string; motif: string; style: VisualStyle; layout: VisualLayout }): string {
  const scene = input.scene.trim().replace(/[.\s]+$/, "");
  const motif = input.motif.trim().replace(/[.\s]+$/, "");
  return [`Scene: ${scene}.`, motif ? `Recurring series setting: ${motif}.` : null, `Art direction: ${ART_DIRECTIONS[input.style].prompt}`, COMPOSITION[input.layout], RULES]
    .filter(Boolean)
    .join("\n");
}

/** What the image source string looks like for an AI visual — the style is kept so a change of style can tell which images are now off-look. */
export const aiSource = (style: VisualStyle) => `ai:${style}`;
export const isAiSource = (source: string | undefined): boolean => Boolean(source?.startsWith("ai:"));
