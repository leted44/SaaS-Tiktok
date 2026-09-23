import { fit } from "@/lib/ai/carousel-generator";
import { IMAGE_SLIDE_LIMITS, type CarouselSlide } from "@/lib/carousel/schema";
import { copyStockImage } from "@/lib/carousel/images";
import { stockCandidates } from "@/lib/stock/search";
import { integrations } from "@/lib/env";

/**
 * Find and copy a stock photo for each slide that should get one.
 *
 * "generate" runs on a freshly written carousel: every cover and content slide
 * gets the best match for the query the model wrote, and a content slide that
 * gains a photo has its title and body re-cut to the tighter limit a photo
 * band leaves room for — the model wrote them before any photo was chosen.
 *
 * "fill" runs on a carousel the user has worked on, like "Remplir toutes les
 * scènes" for a video: only slides without a photo get one, every photo
 * already placed stays, and no text is ever cut — a content slide too long
 * for a photo band is skipped. The pick is drawn among the best few matches,
 * so removing a photo and filling again brings a different one rather than
 * the same photo straight back.
 *
 * Best effort per slide: no match or a failed download leaves that slide as
 * it was. Searching is read-only, so all slides search together; a single
 * synchronous pass then hands out candidates so no two slides get the same
 * photo; the copies then run together too — eight slides cost about as long
 * as one.
 */
export async function withAutoPhotos(
  userId: string,
  slides: CarouselSlide[],
  mode: "generate" | "fill",
): Promise<{ slides: CarouselSlide[]; changed: number; tooLong: number; unmatched: number }> {
  const none = { slides, changed: 0, tooLong: 0, unmatched: 0 };
  if (!integrations.stock()) return none;

  let tooLong = 0;
  const targets = slides
    .map((slide, index) => ({ slide, index, query: (slide.imageQuery || slide.title).slice(0, 80) }))
    .filter(({ slide, query }) => {
      if ((slide.kind !== "cover" && slide.kind !== "content") || !query.trim()) return false;
      if (mode === "generate") return Boolean(slide.imageQuery);
      if (slide.image) return false;
      const fits = slide.kind === "cover" || (slide.title.length <= IMAGE_SLIDE_LIMITS.title && slide.body.length <= IMAGE_SLIDE_LIMITS.body);
      if (!fits) tooLong++;
      return fits;
    });
  if (!targets.length) return { ...none, tooLong };

  const searches = await Promise.allSettled(targets.map(({ query }) => stockCandidates(query, "image", 5)));

  // A photo already in the carousel is never picked for a second slide.
  const used = new Set<string>(slides.flatMap((s) => (s.image?.source ? [s.image.source] : [])));
  const picks = targets.map(({ index }, i) => {
    const result = searches[i];
    const fresh = result.status === "fulfilled" ? result.value.filter((c) => !used.has(c.url)) : [];
    const pool = mode === "fill" ? shuffle(fresh.slice(0, 3)) : fresh;
    const candidates = pool.slice(0, 2);
    candidates.forEach((c) => used.add(c.url));
    return { index, candidates };
  });

  const next = [...slides];
  let changed = 0;
  await Promise.all(
    picks.map(async ({ index, candidates }) => {
      for (const candidate of candidates) {
        try {
          const image = { url: await copyStockImage(userId, candidate.url), source: candidate.url };
          const slide = next[index];
          next[index] =
            mode === "generate" && slide.kind === "content"
              ? { ...slide, image, title: fit(slide.title, IMAGE_SLIDE_LIMITS.title), body: fit(slide.body, IMAGE_SLIDE_LIMITS.body) }
              : { ...slide, image };
          changed++;
          return;
        } catch {
          // Try this slide's other candidate before giving up on it.
        }
      }
    }),
  );
  return { slides: next, changed, tooLong, unmatched: targets.length - changed };
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
