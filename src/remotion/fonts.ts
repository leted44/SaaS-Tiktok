import { continueRender, delayRender } from "remotion";

const GOOGLE_FONTS: Record<string, string> = {
  Inter: "Inter:wght@400;600;700;800;900",
  "Space Grotesk": "Space+Grotesk:wght@500;700",
  "Playfair Display": "Playfair+Display:wght@600;700;800",
  Montserrat: "Montserrat:wght@600;700;800;900",
  "Bebas Neue": "Bebas+Neue",
  Poppins: "Poppins:wght@600;700;800",
  Oswald: "Oswald:wght@500;700",
};

const loaded = new Set<string>();

/** Load a Google Font inside the Remotion runtime (browser + headless renderer). */
export function ensureFont(family: string) {
  if (typeof document === "undefined" || loaded.has(family)) return;
  const spec = GOOGLE_FONTS[family];
  if (!spec) return;
  loaded.add(family);
  const handle = delayRender(`font:${family}`);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  link.onload = () => {
    document.fonts.load(`800 72px "${family}"`).finally(() => continueRender(handle));
  };
  link.onerror = () => continueRender(handle);
  document.head.appendChild(link);
}
