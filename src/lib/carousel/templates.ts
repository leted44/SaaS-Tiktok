import type { CarouselTemplate } from "@/lib/carousel/schema";

/**
 * Everything a template decides, resolved against the brand's colours.
 *
 * A template is a small, deliberate set of choices — one background, one text
 * colour, one accent, one headline face — so every slide it produces looks
 * designed on purpose. The brand colours flow in through the accent, never by
 * letting any colour land anywhere.
 */
export interface TemplateTokens {
  id: CarouselTemplate;
  name: string;
  background: string;
  /** Optional extra layer drawn over the background (glow, texture). */
  overlay: string | null;
  text: string;
  muted: string;
  accent: string;
  /** Colour of text placed on the accent (pills, badges). */
  onAccent: string;
  rule: string;
  /** Unfilled segments of the progress bar — always quieter than the rule, or they read as filled. */
  track: string;
  /** Background of inset cards (the call-to-action block). */
  surface: string;
  headlineFont: "Inter" | "Playfair Display" | "Anton";
  headlineWeight: 400 | 700 | 800;
  headlineCase: "none" | "uppercase";
  headlineTracking: number;
}

interface Brand {
  primary: string;
  accent: string;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `hex`. */
export function readableOn(hex: string): string {
  return contrast(hex, "#FFFFFF") >= contrast(hex, "#111111") ? "#FFFFFF" : "#111111";
}

/** Mix a colour towards black (amount < 0) or white (amount > 0). */
export function shade(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const mixed = rgb.map((c) => Math.round(c + (target - c) * t));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The brand colour, nudged until it is legible on `background`.
 *
 * A brand's primary is chosen for a logo, not for text: a pale yellow brand on
 * a cream slide would be unreadable. Rather than trust it blindly, darken or
 * lighten it in steps until it clears a readable contrast.
 */
function legibleAccent(color: string, background: string): string {
  if (!hexToRgb(color)) return readableOn(background);
  const direction = luminance(background) > 0.4 ? -1 : 1;
  let candidate = color;
  for (let step = 0; step < 8 && contrast(candidate, background) < 3.2; step++) {
    candidate = shade(candidate, direction * 0.15 * (step + 1));
  }
  return candidate;
}

export function resolveTemplate(id: CarouselTemplate, brand: Brand): TemplateTokens {
  switch (id) {
    case "immersive": {
      // Built for AI visuals: every slide a full-bleed image under a warm near-black,
      // poster headlines, the brand colour reserved for the words that matter.
      const background = "#0B0907";
      const accent = legibleAccent(brand.accent, background);
      return {
        id,
        name: "Immersif",
        background,
        overlay: `radial-gradient(circle at 50% 115%, ${accent}33 0%, transparent 58%)`,
        text: "#FFFFFF",
        muted: "rgba(255,255,255,0.74)",
        accent,
        onAccent: readableOn(accent),
        rule: "rgba(255,255,255,0.18)",
        track: "rgba(255,255,255,0.24)",
        surface: "rgba(255,255,255,0.08)",
        headlineFont: "Anton",
        headlineWeight: 400,
        headlineCase: "uppercase",
        headlineTracking: 0.5,
      };
    }
    case "bold": {
      const background = "#0B0B10";
      const accent = legibleAccent(brand.accent, background);
      return {
        id,
        name: "Impact",
        background,
        overlay: `radial-gradient(circle at 85% 0%, ${accent}40 0%, transparent 55%)`,
        text: "#FFFFFF",
        muted: "rgba(255,255,255,0.62)",
        accent,
        onAccent: readableOn(accent),
        rule: "rgba(255,255,255,0.16)",
        track: "rgba(255,255,255,0.16)",
        surface: "rgba(255,255,255,0.07)",
        headlineFont: "Inter",
        headlineWeight: 800,
        headlineCase: "none",
        headlineTracking: -2,
      };
    }
    case "editorial": {
      const background = "#FBF8F1";
      const accent = legibleAccent(brand.primary, background);
      return {
        id,
        name: "Éditorial",
        background,
        overlay: null,
        text: "#1A1814",
        muted: "#6B655A",
        accent,
        onAccent: readableOn(accent),
        rule: "#1A1814",
        track: "rgba(26,24,20,0.14)",
        surface: "rgba(26,24,20,0.05)",
        headlineFont: "Playfair Display",
        headlineWeight: 700,
        headlineCase: "none",
        headlineTracking: -1,
      };
    }
    case "brand": {
      const base = hexToRgb(brand.primary) ? brand.primary : "#7C3AED";
      const text = readableOn(base);
      const light = text === "#FFFFFF";
      return {
        id,
        name: "Marque",
        background: `linear-gradient(155deg, ${shade(base, light ? 0.08 : -0.02)} 0%, ${shade(base, light ? -0.38 : -0.18)} 100%)`,
        overlay: `radial-gradient(circle at 10% 110%, ${light ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)"} 0%, transparent 50%)`,
        text,
        muted: light ? "rgba(255,255,255,0.72)" : "rgba(17,17,17,0.66)",
        accent: text,
        onAccent: base,
        rule: light ? "rgba(255,255,255,0.28)" : "rgba(17,17,17,0.22)",
        track: light ? "rgba(255,255,255,0.28)" : "rgba(17,17,17,0.18)",
        surface: light ? "rgba(255,255,255,0.14)" : "rgba(17,17,17,0.08)",
        headlineFont: "Inter",
        headlineWeight: 800,
        headlineCase: "none",
        headlineTracking: -2,
      };
    }
    case "minimal":
    default: {
      const background = "#F6F4EF";
      const accent = legibleAccent(brand.primary, background);
      return {
        id: "minimal",
        name: "Épuré",
        background,
        overlay: null,
        text: "#111111",
        muted: "#6B6B6B",
        accent,
        onAccent: readableOn(accent),
        rule: "rgba(17,17,17,0.12)",
        track: "rgba(17,17,17,0.12)",
        surface: "rgba(17,17,17,0.05)",
        headlineFont: "Inter",
        headlineWeight: 800,
        headlineCase: "none",
        headlineTracking: -2,
      };
    }
  }
}

/** Swatch colours for the template picker, so the choice is visible before it is made. */
export function templateSwatch(id: CarouselTemplate, brand: Brand): { background: string; text: string; accent: string } {
  const t = resolveTemplate(id, brand);
  return { background: t.background, text: t.text, accent: t.accent };
}
