/**
 * Turn a raw render failure into something a person can act on.
 *
 * Remotion reports a failed visual as a fetch error against its own internal
 * proxy, carrying the whole asset URL — percent-encoded, several hundred
 * characters, and without a single space in it. Putting that straight on screen
 * was both unreadable and, because nothing in a run of non-breaking characters
 * offers a wrap point, wide enough to stretch the page past a phone's viewport.
 */

/** Remotion's frame-extraction proxy. The `src` parameter names the real asset. */
const PROXY_FETCH = /Failed to fetch https?:\/\/\S*?[?&]src=([^&\s]+)/;

/** Anything long enough to have no wrap point of its own. */
const LONG_TOKEN = /\S{60,}/g;

/** The part of a storage key a person would recognise: its file name. */
function fileNameOf(url: string): string | null {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const last = path.split("/").filter(Boolean).pop();
    if (!last) return null;
    // Stored keys are prefixed with an upload timestamp — drop it.
    return last.replace(/^\d{10,}-/, "");
  } catch {
    return null;
  }
}

export function summarizeRenderError(raw: string): string {
  const proxied = raw.match(PROXY_FETCH);
  if (proxied) {
    const name = fileNameOf(decodeURIComponent(proxied[1]));
    return `Un visuel n'a pas pu être lu pendant le rendu${name ? ` (${name})` : ""}. Le fichier est probablement incomplet ou dans un format que le moteur ne sait pas décoder — remplacez-le sur la scène concernée.`;
  }

  if (/timed? ?out|timeout/i.test(raw)) {
    return "Le rendu a dépassé le temps imparti. Réessayez ; si cela se reproduit, réduisez la durée ou la résolution.";
  }

  const firstLine = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "Le rendu a échoué.";
  const cleaned = firstLine.replace(LONG_TOKEN, "…").trim();
  return cleaned.length > 220 ? `${cleaned.slice(0, 217)}…` : cleaned;
}
