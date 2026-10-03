import type { WordTiming } from "@/lib/validations";

function sceneIndexFor(wordIndex: number, boundaries: number[]): number {
  let idx = 0;
  for (let i = 0; i < boundaries.length; i++) if (wordIndex >= boundaries[i]) idx = i;
  return idx;
}

/**
 * French typography puts a space before ? ! : ; and inside « », so splitting on
 * whitespace makes words of lone punctuation — a caption page showing just
 * "?" (seen in a real export). A token with no letter or digit joins its
 * neighbour instead: closing punctuation the word before, an opening « the
 * word after. It still counts as a token, so word indices keep matching the
 * scene boundaries, which are counted the same whitespace-split way.
 */
const isPunctuationOnly = (token: string) => !/[\p{L}\p{N}]/u.test(token);
const isOpening = (token: string) => /^[«“(\[]+$/.test(token);

function attachPunctuation(words: WordTiming[], token: string, endMs: number, pendingOpen: { text: string }): boolean {
  if (!isPunctuationOnly(token)) return false;
  if (isOpening(token)) {
    pendingOpen.text += `${token} `;
    return true;
  }
  const previous = words[words.length - 1];
  if (!previous) return false;
  previous.word = `${previous.word} ${token}`;
  previous.endMs = Math.max(previous.endMs, endMs);
  return true;
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

  const pendingOpen = { text: "" };
  const flush = () => {
    if (!current.trim()) return;
    const timing = { word: current, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), sceneIndex: sceneIndexFor(wordIndex, sceneBoundaries) };
    if (!attachPunctuation(words, current, timing.endMs, pendingOpen)) {
      words.push({ ...timing, word: pendingOpen.text + timing.word });
      pendingOpen.text = "";
    }
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
  const words: WordTiming[] = [];
  const pendingOpen = { text: "" };
  tokens.forEach((word, i) => {
    // Lone punctuation joins its neighbour and adds the pause it marks, not a word's length.
    if (attachPunctuation(words, word, Math.round(t), pendingOpen)) {
      t += /[.!?]/.test(word) ? 260 : /[,;:]/.test(word) ? 120 : 0;
      return;
    }
    // Longer words and sentence ends take a little longer — mimics real cadence.
    const weight = 0.7 + Math.min(word.replace(/[^a-zA-Z0-9]/g, "").length, 12) * 0.05;
    const pause = /[.!?]$/.test(word) ? 260 : /[,;:]$/.test(word) ? 120 : 0;
    const dur = Math.round(base * weight);
    words.push({ word: pendingOpen.text + word, startMs: Math.round(t), endMs: Math.round(t + dur), sceneIndex: sceneIndexFor(i, sceneBoundaries) });
    pendingOpen.text = "";
    t += dur + pause;
  });
  return words;
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
 * Words that lean on the word after them — articles, prepositions,
 * possessives, conjunctions, subject pronouns — in every language the app
 * writes in that separates words with spaces. A caption page that ends on one
 * («dans l'axe de» / «tes pieds.») cuts a phrase in two and reads badly, so
 * the page closes before it and it opens the next one. One shared list: a
 * word that leans in one language and not in another only moves a page break
 * by one word.
 */
const LEANING = new Set(
  (
    "le la les un une des du de d au aux à et ou ni mais donc car or que qu qui dont où " +
    "ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs " +
    "je j tu il elle on nous vous ils elles me m te t se s ne n y en " +
    "dans sur sous avec sans pour par vers chez entre contre comme si quand très tout tous toute toutes " +
    "the a an of to in on at for with and or but your my his her its our their this that these those " +
    "el los las una unos unas del al y o pero con sin por para en tu tus su sus mi mis nuestro nuestra " +
    "der die das den dem des ein eine einen einem einer und oder aber mit ohne für von zu im am auf dein deine mein meine sein seine ihr ihre " +
    "o os um uma uns umas do da dos das no na nos nas e ou mas com sem por para pelo pela teu tua teus tuas seu sua " +
    "il lo gli i uno della dello dei degli nel nella con senza per tra fra tuo tua tuoi tue suo sua " +
    "het een van voor met zonder en of maar naar op aan je jouw mijn zijn haar ons onze hun"
  ).split(" "),
);

const bare = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "").replace(/'$/, "");
const SENTENCE_END = /[.!?…]$/;
const CLAUSE_END = /[,;:]$/;

/**
 * Where a full page should end: after its last comma, colon or semicolon when
 * that keeps at least half the page, otherwise before any words that lean on
 * the next page's words — never fewer than two words.
 */
function breakPoint(page: WordTiming[]): number {
  for (let k = page.length - 1; k >= Math.ceil(page.length / 2); k--) if (CLAUSE_END.test(page[k - 1].word)) return k;
  let k = page.length;
  while (k > 2 && LEANING.has(bare(page[k - 1].word))) k--;
  return k;
}

/**
 * Group words into pages of N words per line × M lines. A page closes at a
 * sentence end, a long pause or a scene change; a page that fills up first
 * closes at the phrase boundary that reads best, and the words after it open
 * the next page.
 */
export function paginateWords(words: WordTiming[], wordsPerLine: number, maxLines: number): CaptionPage[] {
  const perLine = Math.max(1, wordsPerLine);
  const capacity = perLine * Math.max(1, maxLines);
  const pages: CaptionPage[] = [];

  const push = (pageWords: WordTiming[]) => {
    if (!pageWords.length) return;
    const lines: CaptionLine[] = [];
    for (let i = 0; i < pageWords.length; i += perLine) {
      const line = pageWords.slice(i, i + perLine);
      lines.push({ words: line, startMs: line[0].startMs, endMs: line[line.length - 1].endMs });
    }
    pages.push({ lines, startMs: lines[0].startMs, endMs: lines[lines.length - 1].endMs });
  };

  let page: WordTiming[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    page.push(w);
    const next = words[i + 1];
    const hardBreak = !next || SENTENCE_END.test(w.word) || next.startMs - w.endMs > 450 || next.sceneIndex !== w.sceneIndex;
    if (hardBreak) {
      push(page);
      page = [];
    } else if (page.length >= capacity) {
      const k = breakPoint(page);
      push(page.slice(0, k));
      page = page.slice(k);
    }
  }
  push(page);

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
