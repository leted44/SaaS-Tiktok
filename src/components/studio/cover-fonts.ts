import localFont from "next/font/local";
import type { CoverFont } from "@/lib/video-cover";

/**
 * The cover's faces in the browser, for the live preview — the same files the
 * server draws the downloaded picture with (src/assets/fonts). Not preloaded:
 * they load the first time the Couverture block shows a title.
 */
const anton = localFont({ src: "../../assets/fonts/Anton-Regular.ttf", weight: "400", display: "swap", preload: false });
const barlow = localFont({ src: "../../assets/fonts/BarlowCondensed-Black.ttf", weight: "900", display: "swap", preload: false });
const inter = localFont({
  src: [
    { path: "../../assets/fonts/Inter-SemiBold.ttf", weight: "600" },
    { path: "../../assets/fonts/Inter-ExtraBold.ttf", weight: "800" },
  ],
  display: "swap",
  preload: false,
});
const playfair = localFont({ src: "../../assets/fonts/PlayfairDisplay-Bold.ttf", weight: "700", display: "swap", preload: false });
const montserrat = localFont({ src: "../../assets/fonts/Montserrat-latin-900.woff", weight: "900", display: "swap", preload: false });

/** The CSS font-family to use in the browser for each cover face. */
export const COVER_FAMILIES: Record<CoverFont, string> = {
  anton: anton.style.fontFamily,
  barlow: barlow.style.fontFamily,
  inter: inter.style.fontFamily,
  playfair: playfair.style.fontFamily,
  montserrat: montserrat.style.fontFamily,
  fine: inter.style.fontFamily,
};
