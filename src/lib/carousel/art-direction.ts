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
      "Cinematic editorial photograph, hyper-detailed and tactile. Warm golden-hour backlight with glowing rim highlights and soft volumetric haze, rich warm colour grade (amber, honey, deep brown), creamy bokeh background, shallow depth of field, 85mm lens look, razor-sharp textures on the subject, subtle film grain. Moody and premium.",
    swatch: ["#2A1A0E", "#C8873A", "#F3D9A4"],
  },
  studio: {
    label: "Studio",
    hint: "Lumineux, net, magazine",
    prompt:
      "Premium magazine studio photograph, hyper-detailed. Bright soft diffused key light, subtle natural shadows, clean seamless light neutral backdrop, crisp macro detail on every texture, true-to-life colours, minimal props, uncluttered composition.",
    swatch: ["#EDEAE4", "#FFFFFF", "#9A9186"],
  },
  noir: {
    label: "Contraste",
    hint: "Fond noir, lumière dramatique",
    prompt:
      "Low-key dramatic photograph, hyper-detailed. Chiaroscuro lighting: a single hard directional light carving the subject out of a deep black background, strong contrast, glossy highlights on skin and surfaces, rich saturated subject colours, fine texture detail, airborne particles (dust, chalk or steam) catching the light, intense and premium mood.",
    swatch: ["#050505", "#3A2A1F", "#E8B04A"],
  },
  illustration: {
    label: "Illustration 3D",
    hint: "Film d'animation, chaleureux",
    prompt:
      "Still from a high-end 3D animated feature film, ultra-detailed. Expressive, appealing characters with clear emotions, set in hyper-realistic surroundings with tactile textures (skin, fabric, metal, food, fibres). Bright, well-exposed animated-film lighting: a warm key light fills the whole scene, the characters and their faces are brightly lit and clearly readable, a glowing rim light separates them from the background, shadows stay soft and full of visible detail, glowing light sources in the setting. Luminous warm palette (amber, peach, coral), soft volumetric atmosphere, subsurface scattering, shallow depth of field.",
    swatch: ["#3B2418", "#F08A5D", "#FFD6A5"],
  },
  pastel: {
    label: "Doux",
    hint: "Pastel, lumière du jour",
    prompt:
      "Airy lifestyle photograph, finely detailed. Soft natural window daylight, pastel palette (blush, sage, cream), light and fresh mood, gentle shadows, clean uncluttered composition, delicate crisp textures.",
    swatch: ["#F4E7E1", "#C9D8C5", "#FFFFFF"],
  },
};

/**
 * Where the image sits on the slide decides how it must be framed: text is
 * laid over the lower part of a full-bleed image, while a band is a wide strip
 * above the text. An image composed for the wrong one gets its subject cropped
 * or buried under the headline.
 */
export type VisualLayout = "cover" | "bleed" | "band" | "frame";

const COMPOSITION: Record<VisualLayout, string> = {
  // The cover carries more text than any slide — its label, a headline of up
  // to four lines and a subtitle — which reaches up to about 35% from the top
  // in the story format. With the 55% rule of the other slides, a real cover
  // had its key object (the bowl of rice) buried under its own headline.
  cover:
    "Composition: vertical frame. The subject and the key action sit in the upper 40% of the frame, entirely visible and uncut — choose a shot size and camera angle wide enough to fit every element the scene mentions inside that area, the key object raised up rather than held low. The lower 60% continues the same background in darker, simpler tones, with nothing important in it, because the cover headline and its subtitle are printed over it.",
  // The headline is printed over the lower part of a full-bleed slide, so the
  // action has to live above it. The shot size is left to the scene: forcing
  // a close-up (as this once did) cropped out exactly what a slide was about —
  // the feet on the floor, the bar, the body line of an exercise.
  bleed:
    "Composition: vertical frame. The subject and the key action sit in the upper 55% of the frame, entirely visible and uncut — choose the shot size (close-up, medium or full-body wide shot) and camera angle that keep every element the scene mentions inside that area. The lower 45% continues the same background in darker, simpler tones, with nothing important in it, because a headline is printed over it.",
  band: "Composition: wide horizontal frame, subject centred with generous margins, every element the scene mentions fully inside the frame.",
  // A video scene: captions can land anywhere over it, not a fixed text band,
  // so nothing is reserved — the photo is the whole frame.
  frame: "Composition: fill the entire frame edge to edge with the subject and scene, every element the scene mentions fully visible and uncut — no empty or simplified area reserved for text.",
};

/**
 * What every image must get right, phrased as what to show — Google's own
 * guidance for its image models is to describe what you want rather than
 * what you don't — plus the one prohibition image models need spelled out:
 * text, which they render garbled.
 */
const RULES =
  "Quality: anatomically correct people with natural proportions — two arms, two legs, five fingers on each hand, joints bending the right way, a natural grip on any object. Equipment and objects are realistic and physically coherent (a bar is straight and continuous, a weight sits on the floor). Clothing and surfaces are plain and unbranded. One clear focal point in sharp focus, rich detail everywhere. The image contains no text of any kind: no letters, numbers, logos, watermarks, captions or signs.";

const MEDIUM: Record<VisualStyle, string> = {
  cinematic: "photograph",
  studio: "photograph",
  noir: "photograph",
  illustration: "3D animated film still",
  pastel: "photograph",
};

/**
 * The prompt an image model gets, in the order Google recommends for its
 * image models: a strong verb and the medium, then subject and action,
 * setting, composition, style. The scene comes from the slide's own brief;
 * the recurring cast and world, the framing and the art direction are the
 * same for every image of the series, which is what makes it one series.
 */
export function composeImagePrompt(input: { scene: string; motif: string; style: VisualStyle; layout: VisualLayout; purpose?: "carousel" | "video" }): string {
  const scene = input.scene.trim().replace(/[.\s]+$/, "");
  const motif = input.motif.trim().replace(/[.\s]+$/, "");
  return [
    `Create a ${MEDIUM[input.style]} for ${input.purpose === "video" ? "a scene of a premium vertical short-form video" : "a premium Instagram carousel slide"}.`,
    `Scene — subject, action, setting: ${scene}.`,
    motif ? `Recurring cast and world of the series, identical in every image (where it gives a size or position, the composition below wins): ${motif}.` : null,
    COMPOSITION[input.layout],
    `Style: ${ART_DIRECTIONS[input.style].prompt}`,
    RULES,
  ]
    .filter(Boolean)
    .join("\n");
}

/** What the image source string looks like for an AI visual — the style is kept so a change of style can tell which images are now off-look. */
export const aiSource = (style: VisualStyle) => `ai:${style}`;
export const isAiSource = (source: string | undefined): boolean => Boolean(source?.startsWith("ai:"));
