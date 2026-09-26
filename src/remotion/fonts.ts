import { continueRender, delayRender } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadPlayfairDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";

const LOADERS: Record<string, () => { waitUntilDone: () => Promise<undefined> }> = {
  Inter: () => loadInter("normal", { weights: ["400", "600", "700", "800", "900"], subsets: ["latin"] }),
  "Space Grotesk": () => loadSpaceGrotesk("normal", { weights: ["500", "700"], subsets: ["latin"] }),
  "Playfair Display": () => loadPlayfairDisplay("normal", { weights: ["600", "700", "800"], subsets: ["latin"] }),
  Montserrat: () => loadMontserrat("normal", { weights: ["600", "700", "800", "900"], subsets: ["latin"] }),
  "Bebas Neue": () => loadBebasNeue("normal", { weights: ["400"], subsets: ["latin"] }),
  Poppins: () => loadPoppins("normal", { weights: ["600", "700", "800", "900"], subsets: ["latin"] }),
  Oswald: () => loadOswald("normal", { weights: ["500", "700"], subsets: ["latin"] }),
};

const loaded = new Set<string>();

/**
 * Loads a caption/brand font. Used to fetch the Google Fonts CSS API live
 * over the network from inside each Lambda container on every cold start —
 * no cache shared across containers, no timeout, so one slow or flaky
 * DNS/TLS handshake could silently stall a whole render chunk (observed:
 * 154s of dead time on an otherwise ~5s chunk, on a render with no video
 * layers at all). Remotion's own font loader fetches the font files
 * directly instead of injecting a CSS `<link>` tag — the approach Remotion
 * documents as reliable for server-side and Lambda rendering.
 */
export function ensureFont(family: string) {
  if (typeof document === "undefined" || loaded.has(family)) return;
  const load = LOADERS[family];
  if (!load) return;
  loaded.add(family);
  const handle = delayRender(`font:${family}`, { timeoutInMilliseconds: 20_000 });
  load()
    .waitUntilDone()
    .catch(() => undefined)
    .finally(() => continueRender(handle));
}
