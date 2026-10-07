import type { CSSProperties, ReactNode } from "react";
import type { CarouselFormat, CarouselSlide } from "@/lib/carousel/schema";
import { FORMAT_SIZE, typeset } from "@/lib/carousel/schema";
import { shade, type TemplateTokens } from "@/lib/carousel/templates";

/**
 * One carousel slide, drawn at its real pixel size.
 *
 * Rendered by `next/og` (Satori) into the PNG that gets downloaded and shown
 * as the preview, so what the user sees is exactly what they post. That
 * engine lays out a subset of CSS: flexbox only, inline styles only, and every
 * element with more than one child must say `display: flex` — hence the
 * explicit `row`/`col` helpers everywhere.
 */

interface Props {
  slide: CarouselSlide;
  /** Position in the whole carousel, 0-based. */
  index: number;
  total: number;
  /** Position among the content slides only, 1-based — the "01, 02…" numbering. */
  step: number;
  format: CarouselFormat;
  tokens: TemplateTokens;
  handle: string | null;
  /** Absolute URL of the slide's photo, already vetted by the caller. */
  imageUrl?: string | null;
  /**
   * The cover's photo, for the closing slide only. The CTA never gets its own
   * AI visual — the ask should stay the focus — but in Immersive that made it
   * a flat black void jammed between full-bleed photos on either side. A
   * dimmed echo of the cover closes the series instead of breaking it.
   */
  closingImageUrl?: string | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Headline size from how much text it carries.
 *
 * A fixed size either wastes a short title or overflows a long one. Scaling
 * linearly between a comfortable maximum and a still-bold minimum keeps every
 * headline filling the slide the way a designer would set it by hand.
 */
export function headlineSize(text: string, kind: CarouselSlide["kind"], format: CarouselFormat): number {
  const scale = { cover: [118, 70, 22, 90], cta: [124, 78, 14, 50], content: [80, 54, 22, 110] }[kind];
  const [max, min, from, to] = scale;
  const t = clamp((text.length - from) / (to - from), 0, 1);
  const factor = format === "square" ? 0.86 : format === "story" ? 1.06 : 1;
  return Math.round((max - (max - min) * t) * factor);
}

export function bodySize(text: string, format: CarouselFormat): number {
  const size = text.length <= 110 ? 40 : text.length <= 200 ? 36 : 32;
  return Math.round(size * (format === "square" ? 0.9 : 1));
}

const col = (style: CSSProperties = {}): CSSProperties => ({ display: "flex", flexDirection: "column", ...style });
const row = (style: CSSProperties = {}): CSSProperties => ({ display: "flex", flexDirection: "row", ...style });

function Icon({ path, size, color }: { path: string[]; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      {path.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const ARROW = ["M5 12h14", "m12 5 7 7-7 7"];

/** Photo band height on a content slide, per format — a third of the slide, give or take. */
const BAND_HEIGHT: Record<CarouselFormat, number> = { portrait: 470, story: 760, square: 330 };
const slidePadding = (format: CarouselFormat) => (format === "square" ? 80 : 92);

/** The photo box of a content slide in a band template, in pixels — the renderer crops the photo to it. */
export function bandBox(format: CarouselFormat): { width: number; height: number } {
  return { width: FORMAT_SIZE[format].width - slidePadding(format) * 2, height: BAND_HEIGHT[format] };
}

/**
 * Over a photo, the template's own colours stop applying: whatever the photo
 * is, the text sits on the darkened lower half of it, so it is always white.
 */
function onPhoto(t: TemplateTokens): TemplateTokens {
  return { ...t, text: "#FFFFFF", muted: "rgba(255,255,255,0.82)", track: "rgba(255,255,255,0.3)", rule: "rgba(255,255,255,0.4)", background: "#000000", overlay: null };
}

const PHOTO_SCRIM = "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 24%, rgba(0,0,0,0.2) 46%, rgba(0,0,0,0.8) 70%, rgba(0,0,0,0.94) 100%)";

/**
 * The Immersive scrim: clear over the subject, which the image prompt keeps in
 * the upper part of the frame, then a deep fall to near-black under the text.
 * The square format has less height, so its text starts higher and the dark
 * part has to as well.
 */
function immersiveScrim(format: CarouselFormat): string {
  const [clear, dark] = format === "square" ? [18, 52] : [30, 62];
  return `linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) ${clear}%, rgba(0,0,0,0.35) ${(clear + dark) / 2}%, rgba(0,0,0,0.86) ${dark}%, rgba(0,0,0,0.96) 100%)`;
}

/** Encadré: the box carries the text, so the photo is only shaded at the very top, under the signature and counter. */
const BOXED_SCRIM = "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 16%, rgba(0,0,0,0) 100%)";

/**
 * The closing slide's scrim: uniformly dim rather than clear-over-subject —
 * there is no subject to protect here, only the ask, and the photo is a
 * backdrop, not the point. Tinted with the template's own background so the
 * photo's edges blend into it instead of reading as a hard-edged rectangle.
 */
/**
 * The closing slide's shade: the cover's photo stays bright where its subject
 * is (the top — see the cover's framing in lib/carousel/art-direction) and
 * darkens only under the text, which sits low like the cover's headline.
 */
function closingScrim(format: CarouselFormat): string {
  const from = format === "square" ? 22 : 30;
  return `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 14%, rgba(0,0,0,0.08) ${from}%, rgba(0,0,0,0.72) ${from + 22}%, rgba(0,0,0,0.9) 100%)`;
}

/**
 * The title as words, with the emphasis marked.
 *
 * Satori has no inline styling inside a run of text, so a headline with one
 * coloured phrase is laid out as a wrapping row of words. Typography is
 * applied to the whole title first, so the non-breaking spaces it inserts
 * (before "?", between a number and its unit) keep those pairs in one word
 * and never split across lines.
 */
export function headlineWords(title: string, emphasis: string): { text: string; hot: boolean }[][] {
  const set = typeset(title);
  const wanted = emphasis.trim() ? typeset(emphasis.trim()).toLowerCase() : "";
  let start = wanted ? set.toLowerCase().indexOf(wanted) : -1;
  let end = start < 0 ? -1 : start + wanted.length;
  // Only the words take the accent colour: a comma or a full stop stays in the text colour.
  const PUNCT = /[\s.,;:!?…«»"'’ -]/;
  while (start >= 0 && start < end && PUNCT.test(set[start])) start++;
  while (start >= 0 && end > start && PUNCT.test(set[end - 1])) end--;

  const words: { text: string; hot: boolean }[][] = [];
  let at = 0;
  for (const word of set.split(" ")) {
    if (word) {
      const a = Math.max(0, Math.min(word.length, start - at));
      const b = Math.max(0, Math.min(word.length, end - at));
      const segments = start < 0 || b <= a ? [{ text: word, hot: false }] : [{ text: word.slice(0, a), hot: false }, { text: word.slice(a, b), hot: true }, { text: word.slice(b), hot: false }];
      words.push(segments.filter((s) => s.text));
    }
    at += word.length + 1;
  }
  return words;
}

export function CarouselSlideView({ slide, index, total, step, format, tokens, handle, imageUrl, closingImageUrl }: Props) {
  const { width, height } = FORMAT_SIZE[format];
  // Drawn whole by the image model, text included (lib/carousel/baked-slide): the picture is the slide.
  if (slide.bakedText && imageUrl) {
    return (
      <div style={{ display: "flex", width, height, background: tokens.background }}>
        <img src={imageUrl} alt="" width={width} height={height} style={{ width, height, objectFit: "cover" }} />
      </div>
    );
  }
  const padding = slidePadding(format);
  /**
   * TikTok draws its own UI over a posted photo — caption, username, the
   * like/comment/share column, the swipe-position dots — inside roughly the
   * bottom quarter of a 9:16 image. A 4:5 or 1:1 slide sits inside
   * Instagram's own bounded card, chrome-free, so only the story format
   * (TikTok's own aspect ratio) needs the extra clearance built into the
   * layout instead of left to chance: everything below this line is safe to
   * be true image with nothing readable on it, exactly the way a full-bleed
   * photo already reads there.
   */
  const bottomSafe = format === "story" ? 320 : 0;
  const compact = format === "square";
  const immersive = tokens.id === "immersive";
  // Encadré: the headline sits in a dark box over the photo instead of on a scrim.
  const boxed = tokens.id === "boxed";
  const fullBleed = immersive || boxed;
  // Full-bleed: the cover always, and in Immersive and Encadré every content slide too.
  const bleedPhoto = Boolean(imageUrl) && (slide.kind === "cover" || (fullBleed && slide.kind === "content"));
  // The closing slide shows the cover's photo again, as bright as on the cover: the last thing
  // the reader sees is the subject that made them swipe, not a darkened backdrop.
  const ctaPhoto = slide.kind === "cta" && Boolean(closingImageUrl);
  const coverPhoto = slide.kind === "cover" && bleedPhoto;
  const bandPhoto = slide.kind === "content" && Boolean(imageUrl) && !bleedPhoto;
  const t = bleedPhoto || ctaPhoto ? onPhoto(tokens) : tokens;
  const editorial = t.id === "editorial" && !coverPhoto;
  // Condensed faces carry far fewer pixels per word at the same size, so they are set larger.
  const faceScale = t.headlineFont === "Anton" ? 1.16 : t.headlineFont === "Barlow Condensed" ? 1.14 : 1;
  const photoScale = bandPhoto || (bleedPhoto && slide.kind === "content") ? 0.84 : 1;
  const titleSize = Math.round(headlineSize(slide.title, slide.kind, format) * photoScale * faceScale);

  // The emphasised words as a metallic sheen instead of a flat fill — what
  // makes a headline's key word actually pop off the page, the way the
  // strongest accounts in the niche set theirs.
  const hotGradient = `linear-gradient(135deg, ${shade(t.accent, 0.5)} 0%, ${t.accent} 45%, ${shade(t.accent, -0.2)} 100%)`;

  const headline = (text: string, marginTop: number): ReactNode => {
    const words = headlineWords(text, slide.emphasis);
    // Measured on Anton: an accented capital (É, À) tops out at 1.10 em above the baseline.
    // Below a 1.18 line height it touches the line above — French needs the room English does not.
    // Barlow Condensed Black sits lower: 1.04 clears its accents.
    const lineHeight = t.headlineFont === "Anton" ? 1.18 : t.headlineFont === "Barlow Condensed" ? 1.04 : editorial ? 1.08 : 1.02;
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          marginTop,
          columnGap: Math.round(titleSize * (t.headlineFont === "Anton" ? 0.22 : t.headlineFont === "Barlow Condensed" ? 0.2 : 0.26)),
          fontFamily: t.headlineFont,
          fontWeight: t.headlineWeight,
          fontSize: titleSize,
          lineHeight,
          letterSpacing: t.headlineTracking,
          textTransform: t.headlineCase,
          color: t.text,
        }}
      >
        {words.map((segments, i) => (
          <div key={i} style={{ display: "flex" }}>
            {segments.map((s, j) =>
              s.hot && t.flatEmphasis ? (
                <span key={j} style={{ lineHeight, color: t.accent }}>
                  {s.text}
                </span>
              ) : s.hot ? (
                <span key={j} style={{ display: "flex", lineHeight, backgroundImage: hotGradient, backgroundClip: "text", color: "transparent" }}>
                  {s.text}
                </span>
              ) : (
                <span key={j} style={{ lineHeight, color: t.text }}>
                  {s.text}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
    );
  };

  const body = (text: string, marginTop: number, color: string, scale = 1): ReactNode =>
    text ? (
      <div style={{ display: "flex", marginTop, fontSize: Math.round(bodySize(text, format) * scale), lineHeight: 1.42, color, whiteSpace: "pre-wrap" }}>{typeset(text)}</div>
    ) : null;

  const label = (text: string): ReactNode =>
    editorial ? (
      <div style={{ display: "flex", fontSize: 24, fontWeight: 600, letterSpacing: 5, textTransform: "uppercase", color: t.accent }}>{typeset(text)}</div>
    ) : (
      <div style={row({ alignSelf: "flex-start", padding: "12px 22px", borderRadius: 999, background: t.accent, color: t.onAccent, fontSize: 23, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase" })}>
        {typeset(text)}
      </div>
    );

  const bar = (marginTop: number): ReactNode =>
    editorial ? (
      <div style={{ display: "flex", marginTop, width: "100%", height: 2, background: t.rule }} />
    ) : (
      <div style={{ display: "flex", marginTop, width: 132, height: 10, borderRadius: 5, background: t.accent }} />
    );

  /**
   * The Encadré caption box: dark, rounded, a short accent bar on top — the
   * headline reads on any photo, however bright, so the photo needs no
   * darkening and stays as vivid as it was generated.
   */
  const captionBox = (...children: ReactNode[]): ReactNode => (
    <div style={col({ padding: compact ? "28px 32px 32px" : "34px 40px 40px", borderRadius: 30, background: "rgba(10,11,13,0.86)" })}>
      <div style={{ display: "flex", width: 96, height: 10, borderRadius: 5, background: t.accent }} />
      {/* Children passed one by one: a fragment here was laid out as a row by Satori. */}
      {children}
    </div>
  );

  let main: ReactNode;
  if (boxed && slide.kind === "cover" && coverPhoto) {
    main = (
      <div style={col({ flexGrow: 1, justifyContent: "flex-end", paddingBottom: 24 })}>
        {slide.kicker ? <div style={{ display: "flex", marginBottom: 22 }}>{label(slide.kicker)}</div> : null}
        {captionBox(headline(slide.title, 22), body(slide.body, 20, "rgba(255,255,255,0.86)", 0.9))}
      </div>
    );
  } else if (boxed && slide.kind === "content" && bleedPhoto) {
    main = (
      <div style={col({ flexGrow: 1, justifyContent: "flex-end", paddingBottom: 24 })}>
        {captionBox(
          <div key="n" style={row({ marginTop: 22, alignItems: "center", gap: 18 })}>
            <div style={{ display: "flex", fontFamily: t.headlineFont, fontWeight: t.headlineWeight, fontSize: 60, lineHeight: 1, color: t.accent }}>{pad(step)}</div>
            {slide.kicker ? label(slide.kicker) : null}
          </div>,
          headline(slide.title, 14),
          body(slide.body, 18, "rgba(255,255,255,0.88)", 0.88),
        )}
      </div>
    );
  } else if (slide.kind === "cover") {
    main = (
      <div style={col({ flexGrow: 1, justifyContent: coverPhoto ? "flex-end" : "center", paddingBottom: coverPhoto ? 48 : 0 })}>
        {slide.kicker ? label(slide.kicker) : null}
        {headline(slide.title, slide.kicker ? 36 : 0)}
        {/* The poster headline already carries the slide; a rule under it would only compete. */}
        {immersive ? null : bar(coverPhoto ? 40 : 48)}
        {body(slide.body, immersive ? 30 : coverPhoto ? 34 : 44, immersive ? "rgba(255,255,255,0.88)" : t.muted)}
      </div>
    );
  } else if (slide.kind === "cta") {
    const closing = <CtaBody slide={slide} t={t} compact={compact} headline={headline} body={body} label={label} />;
    main = (
      <div style={col({ flexGrow: 1, justifyContent: ctaPhoto ? "flex-end" : "center", paddingBottom: ctaPhoto ? 40 : 0 })}>
        {boxed && ctaPhoto ? captionBox(<div key="c" style={col({ marginTop: 22 })}>{closing}</div>) : closing}
      </div>
    );
  } else if (bleedPhoto) {
    main = (
      <div style={col({ flexGrow: 1, justifyContent: "flex-end", paddingBottom: 36 })}>
        <div style={row({ alignItems: "center", gap: 20 })}>
          <div style={{ display: "flex", fontFamily: t.headlineFont, fontWeight: t.headlineWeight, fontSize: 64, lineHeight: 1, color: t.accent }}>{pad(step)}</div>
          {slide.kicker ? label(slide.kicker) : null}
        </div>
        {headline(slide.title, 18)}
        {body(slide.body, 24, "rgba(255,255,255,0.9)", 0.92)}
      </div>
    );
  } else if (bandPhoto) {
    main = (
      <div style={col({ flexGrow: 1, justifyContent: "center" })}>
        <img src={imageUrl!} alt="" width={width - padding * 2} height={BAND_HEIGHT[format]} style={{ width: width - padding * 2, height: BAND_HEIGHT[format], objectFit: "cover", borderRadius: 28 }} />
        <div style={row({ marginTop: 40, alignItems: "center", gap: 20 })}>
          <div style={{ display: "flex", fontFamily: t.headlineFont, fontWeight: t.headlineWeight, fontSize: 56, lineHeight: 1, letterSpacing: -2, color: t.accent }}>{pad(step)}</div>
          {slide.kicker ? label(slide.kicker) : null}
        </div>
        {headline(slide.title, 22)}
        {body(slide.body, 26, t.text, 0.92)}
      </div>
    );
  } else {
    main = (
      <div style={col({ flexGrow: 1, justifyContent: "center" })}>
        <div style={{ display: "flex", fontFamily: t.headlineFont, fontWeight: t.headlineWeight, fontSize: editorial ? 132 : immersive ? 150 : 120, lineHeight: 1, letterSpacing: immersive ? 0 : -4, color: t.accent }}>{pad(step)}</div>
        {slide.kicker ? <div style={{ display: "flex", marginTop: 28 }}>{label(slide.kicker)}</div> : null}
        {headline(slide.title, slide.kicker ? 28 : 36)}
        {bar(40)}
        {body(slide.body, 40, t.text)}
      </div>
    );
  }

  const last = index === total - 1;
  /** A single-image post: no position to show, nothing to swipe to. */
  const single = total === 1;
  const segment = Math.max(18, Math.min(64, Math.floor((width - padding * 2 - 260) / total) - 8));

  return (
    <div style={col({ position: "relative", width, height, paddingTop: padding, paddingLeft: padding, paddingRight: padding, paddingBottom: padding + bottomSafe, background: t.background, color: t.text, fontFamily: "Inter", fontWeight: 400 })}>
      {bleedPhoto || ctaPhoto ? (
        <img src={(ctaPhoto ? closingImageUrl : imageUrl)!} alt="" width={width} height={height} style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }} />
      ) : null}
      {bleedPhoto || ctaPhoto ? (
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width, height, backgroundImage: ctaPhoto ? closingScrim(format) : boxed ? BOXED_SCRIM : immersive ? immersiveScrim(format) : PHOTO_SCRIM }} />
      ) : null}
      {t.overlay ? <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width, height, backgroundImage: t.overlay }} /> : null}

      <div style={row({ justifyContent: "space-between", alignItems: "center", fontSize: 26, fontWeight: 600, color: t.muted })}>
        <div style={{ display: "flex" }}>{handle ?? ""}</div>
        <div style={{ display: "flex", letterSpacing: 1 }}>{single ? "" : `${pad(index + 1)} / ${pad(total)}`}</div>
      </div>

      {main}

      <div style={row({ justifyContent: "space-between", alignItems: "center" })}>
        <div style={row({ gap: 8 })}>
          {Array.from({ length: single ? 0 : total }, (_, i) => (
            <div key={i} style={{ display: "flex", width: segment, height: 6, borderRadius: 3, background: i <= index ? t.accent : t.track }} />
          ))}
        </div>
        {last ? (
          <div style={{ display: "flex" }} />
        ) : (
          <div style={row({ alignItems: "center", gap: 12, fontSize: 26, fontWeight: 600, color: slide.kind === "cover" ? t.text : t.muted })}>
            {slide.kind === "cover" ? <div style={{ display: "flex" }}>Glisse</div> : null}
            <Icon path={ARROW} size={34} color={slide.kind === "cover" ? t.text : t.muted} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The closing slide: one ask the reader can act on, the moment that gives it
 * a reason, then who to send the post to — named by what that person says,
 * which turns a share into a nudge between friends. No drawn buttons and no
 * follow card: they read as a template and ask for three things at once.
 * Older carousels have no `shareTo`; their whole ask sits in `action`.
 */
function CtaBody({ slide, t, compact, headline, body, label }: {
  slide: CarouselSlide;
  t: TemplateTokens;
  compact: boolean;
  headline: (text: string, marginTop: number) => ReactNode;
  body: (text: string, marginTop: number, color: string, scale?: number) => ReactNode;
  label: (text: string) => ReactNode;
}) {
  const share = slide.shareTo.trim();
  const lead = slide.action.trim();
  return (
    <div style={col({})}>
      {slide.kicker ? label(slide.kicker) : null}
      {headline(slide.title, slide.kicker ? 30 : 0)}
      {body(slide.body, compact ? 20 : 28, t.text, compact ? 0.98 : 1.08)}
      {lead || share ? <div style={{ display: "flex", marginTop: compact ? 26 : 38, width: 220, height: 3, borderRadius: 2, background: t.accent }} /> : null}
      {lead ? (
        <div style={{ display: "flex", marginTop: compact ? 20 : 30, fontSize: share ? (compact ? 30 : 36) : compact ? 32 : 40, fontWeight: 800, lineHeight: 1.25, letterSpacing: share ? 1.5 : 0, textTransform: share ? "uppercase" : "none", color: t.text }}>{typeset(lead)}</div>
      ) : null}
      {share ? (
        <div style={{ display: "flex", marginTop: compact ? 10 : 14, fontSize: compact ? 40 : 50, fontWeight: 800, lineHeight: 1.2, color: t.accent }}>{typeset(share)}</div>
      ) : null}
    </div>
  );
}
