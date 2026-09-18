import type { WordTiming } from "@/lib/validations";

function sceneIndexFor(wordIndex: number, boundaries: number[]): number {
  let idx = 0;
  for (let i = 0; i < boundaries.length; i++) if (wordIndex >= boundaries[i]) idx = i;
  return idx;
}

/**
 * Convert ElevenLabs character-level alignment into word-level timings.
 * Words are split on whitespace; punctuation stays attached to its word.
 */
export function alignmentToWordTimings(characters: string[], starts: number[], ends: number[], sceneBoundaries: number[]): WordTiming[] {
  const words: WordTiming[] = [];
  let current = "";
  let start = 0;
  let end = 0;
  let wordIndex = 0;

  const flush = () => {
    if (!current.trim()) return;
    words.push({ word: current, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), sceneIndex: sceneIndexFor(wordIndex, sceneBoundaries) });
    wordIndex++;
    current = "";
  };

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (!current) start = starts[i];
    current += ch;
    end = ends[i];
  }
  flush();
  return mergeTinyGaps(words);
}

/** Uniform timings for offline mode or when a provider returns no alignment. */
export function estimateWordTimings(text: string, sceneBoundaries: number[], wordsPerSecond = 2.6): WordTiming[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const base = 1000 / wordsPerSecond;
  let t = 250;
  return tokens.map((word, i) => {
    // Longer words and sentence ends take a little longer — mimics real cadence.
    const weight = 0.7 + Math.min(word.replace(/[^a-zA-Z0-9]/g, "").length, 12) * 0.05;
    const pause = /[.!?]$/.test(word) ? 260 : /[,;:]$/.test(word) ? 120 : 0;
    const dur = Math.round(base * weight);
    const timing = { word, startMs: Math.round(t), endMs: Math.round(t + dur), sceneIndex: sceneIndexFor(i, sceneBoundaries) };
    t += dur + pause;
    return timing;
  });
}

function mergeTinyGaps(words: WordTiming[]): WordTiming[] {
  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].startMs - words[i].endMs;
    if (gap > 0 && gap < 80) words[i].endMs = words[i + 1].startMs;
  }
  return words;
}

export interface CaptionLine {
  words: WordTiming[];
  startMs: number;
  endMs: number;
}

export interface CaptionPage {
  lines: CaptionLine[];
  startMs: number;
  endMs: number;
}

/**
 * Group words into pages of N words per line × M lines, breaking early at
 * sentence ends and long pauses so captions read naturally.
 */
export function paginateWords(words: WordTiming[], wordsPerLine: number, maxLines: number): CaptionPage[] {
  const pages: CaptionPage[] = [];
  let line: WordTiming[] = [];
  let lines: CaptionLine[] = [];

  const closeLine = () => {
    if (!line.length) return;
    lines.push({ words: line, startMs: line[0].startMs, endMs: line[line.length - 1].endMs });
    line = [];
  };
  const closePage = () => {
    closeLine();
    if (!lines.length) return;
    pages.push({ lines, startMs: lines[0].startMs, endMs: lines[lines.length - 1].endMs });
    lines = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    line.push(w);
    const next = words[i + 1];
    const sentenceEnd = /[.!?]$/.test(w.word);
    const longPause = next ? next.startMs - w.endMs > 450 : false;
    const sceneChange = next ? next.sceneIndex !== w.sceneIndex : false;
    if (line.length >= wordsPerLine || sentenceEnd || longPause || sceneChange) closeLine();
    if (lines.length >= maxLines || ((sentenceEnd || longPause || sceneChange) && lines.length)) closePage();
  }
  closePage();

  // Extend each page to the start of the next so there is no flicker between pages.
  for (let i = 0; i < pages.length - 1; i++) pages[i].endMs = Math.max(pages[i].endMs, pages[i + 1].startMs);
  return pages;
}

/** SRT export for platforms that accept sidecar captions. */
export function toSrt(words: WordTiming[], wordsPerLine = 4, maxLines = 2): string {
  const pages = paginateWords(words, wordsPerLine, maxLines);
  const fmt = (ms: number) => {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    const msPart = ms % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(msPart).padStart(3, "0")}`;
  };
  return pages
    .map((p, i) => `${i + 1}\n${fmt(p.startMs)} --> ${fmt(p.endMs)}\n${p.lines.map((l) => l.words.map((w) => w.word).join(" ")).join("\n")}\n`)
    .join("\n");
}
