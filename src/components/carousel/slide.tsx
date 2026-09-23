import type { CSSProperties, ReactNode } from "react";
import type { CarouselFormat, CarouselSlide } from "@/lib/carousel/schema";
import { FORMAT_SIZE, typeset } from "@/lib/carousel/schema";
import type { TemplateTokens } from "@/lib/carousel/templates";

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
  const scale = { cover: [118, 70, 22, 90], cta: [92, 62, 18, 80], content: [80, 54, 22, 110] }[kind];
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
const BOOKMARK = ["m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"];

export function CarouselSlideView({ slide, index, total, step, format, tokens: t, handle }: Props) {
  const { width, height } = FORMAT_SIZE[format];
  const padding = format === "square" ? 80 : 92;
  const editorial = t.id === "editorial";
  const titleSize = headlineSize(slide.title, slide.kind, format);

  const headline = (text: string, marginTop: number): ReactNode => (
    <div
      style={{
        display: "flex",
        marginTop,
        fontFamily: t.headlineFont,
        fontWeight: t.headlineWeight,
        fontSize: titleSize,
        lineHeight: editorial ? 1.08 : 1.02,
        letterSpacing: t.headlineTracking,
        textTransform: t.headlineCase,
        color: t.text,
      }}
    >
      {typeset(text)}
    </div>
  );

  const body = (text: string, marginTop: number, color: string): ReactNode =>
    text ? (
      <div style={{ display: "flex", marginTop, fontSize: bodySize(text, format), lineHeight: 1.42, color, whiteSpace: "pre-wrap" }}>{typeset(text)}</div>
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

  let main: ReactNode;
  if (slide.kind === "cover") {
    main = (
      <div style={col({ flexGrow: 1, justifyContent: "center" })}>
        {slide.kicker ? label(slide.kicker) : null}
        {headline(slide.title, slide.kicker ? 40 : 0)}
        {bar(48)}
        {body(slide.body, 44, t.muted)}
      </div>
    );
  } else if (slide.kind === "cta") {
    main = (
      <div style={col({ flexGrow: 1, justifyContent: "center" })}>
        {slide.kicker ? label(slide.kicker) : null}
        {headline(slide.title, slide.kicker ? 40 : 0)}
        {body(slide.body, 36, t.muted)}
        <div style={row({ marginTop: 64, alignItems: "center", alignSelf: "flex-start", gap: 18, padding: "26px 40px", borderRadius: 999, background: t.accent, color: t.onAccent, fontSize: 32, fontWeight: 600 })}>
          <Icon path={BOOKMARK} size={34} color={t.onAccent} />
          <div style={{ display: "flex" }}>Enregistre ce post</div>
        </div>
        {handle ? (
          <div style={row({ marginTop: 34, alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600, color: t.text })}>
            <div style={{ display: "flex", color: t.muted, fontWeight: 400 }}>Plus de contenus :</div>
            <div style={{ display: "flex" }}>{handle}</div>
          </div>
        ) : null}
      </div>
    );
  } else {
    main = (
      <div style={col({ flexGrow: 1, justifyContent: "center" })}>
        <div
          style={{
            display: "flex",
            fontFamily: t.headlineFont,
            fontWeight: t.headlineWeight,
            fontSize: editorial ? 132 : 120,
            lineHeight: 1,
            letterSpacing: -4,
            color: t.accent,
          }}
        >
          {pad(step)}
        </div>
        {slide.kicker ? <div style={{ display: "flex", marginTop: 28 }}>{label(slide.kicker)}</div> : null}
        {headline(slide.title, slide.kicker ? 28 : 36)}
        {bar(40)}
        {body(slide.body, 40, t.text)}
      </div>
    );
  }

  const last = index === total - 1;
  const segment = Math.max(18, Math.min(64, Math.floor((width - padding * 2 - 260) / total) - 8));

  return (
    <div
      style={col({
        position: "relative",
        width,
        height,
        padding,
        background: t.background,
        color: t.text,
        fontFamily: "Inter",
        fontWeight: 400,
      })}
    >
      {t.overlay ? <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width, height, backgroundImage: t.overlay }} /> : null}

      <div style={row({ justifyContent: "space-between", alignItems: "center", fontSize: 26, fontWeight: 600, color: t.muted })}>
        <div style={{ display: "flex" }}>{handle ?? ""}</div>
        <div style={{ display: "flex", letterSpacing: 1 }}>{`${pad(index + 1)} / ${pad(total)}`}</div>
      </div>

      {main}

      <div style={row({ justifyContent: "space-between", alignItems: "center" })}>
        <div style={row({ gap: 8 })}>
          {Array.from({ length: total }, (_, i) => (
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
