import type { CaptionStyle, CaptionPresetId } from "@/lib/validations";

export interface CaptionPreset {
  id: CaptionPresetId;
  name: string;
  description: string;
  style: CaptionStyle;
}

const base: CaptionStyle = {
  preset: "hormozi",
  fontFamily: "Inter",
  fontSize: 72,
  fontWeight: 800,
  textColor: "#FFFFFF",
  highlightColor: "#F59E0B",
  highlightMode: "color",
  strokeColor: "#000000",
  strokeWidth: 6,
  shadow: true,
  uppercase: true,
  wordsPerLine: 3,
  maxLines: 2,
  position: "center",
  verticalOffset: 0,
  animation: "pop",
  backgroundColor: null,
  backgroundOpacity: 0.6,
  emojiBoost: false,
};

export const CAPTION_PRESETS: CaptionPreset[] = [
  { id: "hormozi", name: "Hormozi", description: "Majuscules grasses, mot en surbrillance jaune, contour épais.", style: { ...base } },
  { id: "karaoke", name: "Karaoké", description: "Les mots se colorent au fur et à mesure qu'ils sont prononcés.", style: { ...base, preset: "karaoke", uppercase: false, fontWeight: 700, fontSize: 64, highlightColor: "#7C3AED", highlightMode: "color", strokeWidth: 4, wordsPerLine: 4, animation: "fade" } },
  { id: "minimal", name: "Minimaliste", description: "Sans-serif épuré, ombre légère, sans contour.", style: { ...base, preset: "minimal", uppercase: false, fontWeight: 600, fontSize: 56, strokeWidth: 0, highlightMode: "underline", highlightColor: "#FFFFFF", wordsPerLine: 5, position: "bottom", animation: "fade" } },
  { id: "neon", name: "Néon", description: "Texte lumineux avec surbrillance cyan — parfait pour la tech et le gaming.", style: { ...base, preset: "neon", fontFamily: "Space Grotesk", textColor: "#F0FDFF", highlightColor: "#22D3EE", strokeColor: "#0E7490", strokeWidth: 3, highlightMode: "scale", animation: "pop" } },
  { id: "boxed", name: "Encadré", description: "Surbrillance mot par mot dans un cadre, look natif TikTok.", style: { ...base, preset: "boxed", highlightMode: "box", highlightColor: "#7C3AED", strokeWidth: 0, fontSize: 68, backgroundColor: "#000000", backgroundOpacity: 0.55, animation: "slide" } },
  { id: "editorial", name: "Éditorial", description: "Police serif, positionné en bas, rythme élégant.", style: { ...base, preset: "editorial", fontFamily: "Playfair Display", uppercase: false, fontWeight: 700, fontSize: 60, strokeWidth: 0, highlightMode: "color", highlightColor: "#FBBF24", position: "bottom", wordsPerLine: 5, maxLines: 2, animation: "fade" } },
];

export const CAPTION_PRESET_BY_ID = Object.fromEntries(CAPTION_PRESETS.map((p) => [p.id, p])) as Record<CaptionPresetId, CaptionPreset>;

export function presetStyle(id: string | null | undefined): CaptionStyle {
  return (id && CAPTION_PRESET_BY_ID[id as CaptionPresetId]?.style) || CAPTION_PRESETS[0].style;
}

export const CAPTION_FONTS = ["Inter", "Space Grotesk", "Playfair Display", "Montserrat", "Bebas Neue", "Poppins", "Oswald"];
