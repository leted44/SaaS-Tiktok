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
  if (slide.kind === "cta") return <ClosingSlide slide={slide} format={format} tokens={tokens} photo={imageUrl ?? closingImageUrl ?? null} ownPhoto={Boolean(imageUrl)} />;
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
  const coverPhoto = slide.kind === "cover" && bleedPhoto;
  const bandPhoto = slide.kind === "content" && Boolean(imageUrl) && !bleedPhoto;
  const t = bleedPhoto ? onPhoto(tokens) : tokens;
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
      {bleedPhoto ? (
        <img src={imageUrl!} alt="" width={width} height={height} style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }} />
      ) : null}
      {bleedPhoto ? (
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width, height, backgroundImage: boxed ? BOXED_SCRIM : immersive ? immersiveScrim(format) : PHOTO_SCRIM }} />
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


/** 👉 from Twemoji (CC-BY 4.0, see src/assets/emoji/LICENSE.txt): the slide renderer draws no emoji of its own. */
const POINTER = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><path fill="#FFDC5D" d="M15.856 31s2.394-.208 3.068-1.792c.697-1.639-.622-2.309-.622-2.309s1.914.059 2.622-1.941c.668-1.885-.958-2.75-.958-2.75s1.871-.307 2.417-2.292C22.842 18.245 21.216 17 21.216 17h12.208c.959 0 2.575-.542 2.576-2.543.002-2-1.659-2.457-2.576-2.457h-20.5c-1 0-1-1 0-1h2.666c3.792 0 6.143-2.038 6.792-2.751.65-.713.979-1.667.734-2.82-.415-1.956-1.92-1.529-3.197-.975-3.078 1.337-7.464 2.254-9.538 2.533C4.523 7.778.006 12.796 0 18.871-.004 25.497 5.298 30.995 11.924 31h3.932z"/></svg>`)}`;

const BOOKMARK = ["m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"];

/**
 * The closing slide, set like the owner's reference (a ChatGPT carousel): the
 * text centred at the top over the dark part of the picture, the subject
 * bright in the lower part. A wide heavy headline in capitals with a bookmark,
 * the reason under it, a rule, the share lead in capitals, then 👉 and who to
 * send it to, their words in bold. Warm ivory text; the carousel's accent only
 * on the bookmark and the rule. No counter or progress bar on the last slide.
 *
 * Its own image (a baked or generated one) fills the slide; otherwise the
 * cover's photo is lowered by a third, which puts the cover's subject (framed
 * in its upper part) under the text, and the empty top is faded to the
 * background.
 */
function ClosingSlide({ slide, format, tokens, photo, ownPhoto }: { slide: CarouselSlide; format: CarouselFormat; tokens: TemplateTokens; photo: string | null; ownPhoto: boolean }) {
  const { width, height } = FORMAT_SIZE[format];
  const compact = format === "square";
  const story = format === "story";
  const ink = photo ? "#FFF6E8" : tokens.text;
  const base = photo ? "#0E0A08" : tokens.background;
  const k = compact ? 0.78 : story ? 1 : 0.92;
  const title = typeset(slide.title.trim());
  const titleSize = Math.round((title.length <= 18 ? 104 : title.length <= 28 ? 96 : title.length <= 40 ? 84 : 72) * k);
  // Below the text block (measured on a full closing slide), so no line ever sits on the picture.
  const shift = ownPhoto ? 0 : Math.round(height * (story ? 0.47 : compact ? 0.53 : 0.55));
  const share = slide.shareTo.trim();
  const quoteAt = share.indexOf("«");
  const shareIntro = quoteAt > 0 ? share.slice(0, quoteAt).trim() : "";
  const shareQuote = quoteAt > 0 ? share.slice(quoteAt).trim() : share;
  const pad = compact ? 70 : 84;

  return (
    <div style={col({ position: "relative", width, height, background: base, color: ink, fontFamily: "Montserrat", fontWeight: 500, alignItems: "center", paddingTop: Math.round(height * (story ? 0.07 : 0.075)), paddingLeft: pad, paddingRight: pad })}>
      {photo ? <img src={photo} alt="" width={width} height={height} style={{ position: "absolute", top: shift, left: 0, width, height, objectFit: "cover" }} /> : null}
      {photo ? (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height,
            backgroundImage: ownPhoto
              ? "linear-gradient(180deg, rgba(14,10,8,0.82) 0%, rgba(14,10,8,0.55) 38%, rgba(14,10,8,0) 58%)"
              : `linear-gradient(180deg, ${base} 0px, ${base} ${shift + 2}px, rgba(14,10,8,0.6) ${shift + Math.round(height * 0.06)}px, rgba(14,10,8,0) ${shift + Math.round(height * 0.18)}px)`,
          }}
        />
      ) : null}

      <div style={row({ flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end", columnGap: Math.round(titleSize * 0.26), fontWeight: 900, fontSize: titleSize, lineHeight: 1.08, letterSpacing: -1, textTransform: "uppercase", textAlign: "center" })}>
        {title.split(" ").filter(Boolean).map((word, i) => (
          <div key={i} style={{ display: "flex" }}>{word}</div>
        ))}
        <div style={{ display: "flex", marginBottom: Math.round(titleSize * 0.1) }}>
          <svg width={Math.round(titleSize * 0.62)} height={Math.round(titleSize * 0.78)} viewBox="5 3 14 18">
            <path d={BOOKMARK[0]} fill={tokens.accent} />
          </svg>
        </div>
      </div>

      {slide.body.trim() ? (
        <div style={{ display: "flex", marginTop: Math.round(26 * k), fontSize: Math.round(42 * k), lineHeight: 1.3, textAlign: "center", justifyContent: "center" }}>{typeset(slide.body.trim())}</div>
      ) : null}

      {slide.action.trim() || share ? <div style={{ display: "flex", marginTop: Math.round(44 * k), width: Math.round(width * 0.3), height: 4, borderRadius: 2, background: tokens.accent }} /> : null}

      {slide.action.trim() ? (
        <div style={{ display: "flex", marginTop: Math.round(40 * k), fontSize: Math.round(46 * k), fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", textAlign: "center" }}>{typeset(slide.action.trim())}</div>
      ) : null}

      {share ? (
        <div style={col({ marginTop: Math.round(18 * k), alignItems: "center" })}>
          <div style={row({ alignItems: "center", gap: Math.round(16 * k), fontSize: Math.round(46 * k), lineHeight: 1.25 })}>
            <img src={POINTER} alt="" width={Math.round(52 * k)} height={Math.round(52 * k)} />
            {shareIntro ? <div style={{ display: "flex" }}>{typeset(shareIntro)}</div> : <div style={{ display: "flex", fontWeight: 800 }}>{typeset(shareQuote)}</div>}
          </div>
          {shareIntro ? <div style={{ display: "flex", marginTop: Math.round(6 * k), fontSize: Math.round(50 * k), fontWeight: 800, lineHeight: 1.22, textAlign: "center", justifyContent: "center" }}>{typeset(shareQuote)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
