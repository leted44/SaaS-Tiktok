"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowDown, ArrowUp, Check, CheckCircle2, Coins, Download, Archive, GalleryHorizontalEnd, ImageIcon, ImagePlus, Loader2, MessageSquareText, Palette, Pencil, Plus, RefreshCw, Search, Share2, Sparkles, Trash2, Type, Undo2, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { zipSync } from "fflate";
import { withCaptureDate } from "@/lib/carousel/capture-date";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { SocialCopyBlock } from "@/components/studio/social-copy";
import { ScriptCard, type CarouselScript } from "@/components/carousel/script-card";
import { ScriptStart } from "@/components/carousel/script-start";
import type { ImageModelChoice } from "@/lib/ai/image-models";
import { ImageModelPicker, useAdminImageModel } from "@/components/shared/image-model-picker";
import { ReviewCard } from "@/components/shared/review-card";
import { CharacterReference, type CharacterReferenceState } from "@/components/shared/character-reference";
import type { ReviewReport, ReviewTally } from "@/lib/ai/review-report";
import { generateCarouselAction, generateCarouselVisualsAction, generateSlideImageAction, importCarouselImageAction, fillCarouselPhotosAction, saveCarouselAction, type CarouselSnapshot } from "@/server/actions/carousels";
import { uploadAsset } from "@/lib/assets/upload-client";
import { CAROUSEL_FORMATS, CAROUSEL_TEMPLATES, CONTENT_SLIDES, FORMAT_SIZE, IMAGE_PROMPT_MAX, VISUAL_MOTIF_MAX, SLIDE_LIMITS, fullBleedTemplate, IMAGE_SLIDE_LIMITS, imageAspect, imageLayout, imageOrigin, imageSceneOf, limitsFor, needsAiVisual, slideFileName, zipFileName, tooLongForImage, type CarouselLength, type CarouselSlide, type CarouselState, type CarouselTemplate } from "@/lib/carousel/schema";
import { composeImagePrompt, type VisualStyle } from "@/lib/carousel/art-direction";
import { geminiPrompt } from "@/lib/ai/gemini-prompt";
import { CopyForGemini } from "@/components/shared/copy-for-gemini";
import { StylePicker } from "@/components/shared/style-picker";
import { resolveTemplate } from "@/lib/carousel/templates";
import { FormatSwitcher } from "@/components/studio/format-switcher";
import type { SocialCopy } from "@/lib/social/captions";
import { MarkPostedDialog } from "@/components/projects/mark-posted-dialog";
import { ResultsButton } from "@/components/results/results-dialog";
import { unmarkProjectPosted } from "@/server/actions/projects";
import { POST_PLATFORM_LABELS, type PostPlatform } from "@/lib/projects/progress";
import { cn } from "@/lib/utils";

const MAX_CONTENT_SLIDES = 8;

interface Props {
  projectId: string;
  projectTitle: string;
  initial: CarouselSnapshot | null;
  brand: { primary: string; accent: string };
  hasScript: boolean;
  script: (CarouselScript & { socialCopy: SocialCopy }) | null;
  cost: number;
  socialCopyCost: number;
  aiImageCost: number;
  credits: number;
  aiConfigured: boolean;
  stockConfigured: boolean;
  aiImagesConfigured: boolean;
  posted: { platforms: string[] } | null;
  /** The admin account sees the image model test. */
  admin: boolean;
  /** The character sheet its AI images are drawn with (lib/characters). */
  characterReference: CharacterReferenceState;
  /** The art direction a carousel without one starts on: its space's (lib/space-style), else the app default. */
  defaultStyle: VisualStyle;
  /** What the critic pass did to the script — admin only. */
  review: { report: ReviewReport; tally: ReviewTally | null } | null;
  /** What the script of a project without one is written from. */
  scriptStart: { topic: string; niche: string | null; language: string; cost: number };
}

const pad = (n: number) => String(n).padStart(2, "0");
const withoutVersion = (s: CarouselSnapshot): CarouselState => ({ template: s.template, format: s.format, handle: s.handle, slides: s.slides, visualStyle: s.visualStyle, visualMotif: s.visualMotif, accent: s.accent });
/** See slideUrl. 2: images read from storage instead of their public URL. 3: per-slide keys. */
const RENDER_REVISION = 3;

/**
 * A short fingerprint of everything one slide's image is drawn from, in a
 * saved carousel state (JSON): its own content, the design settings, its
 * position and the slide count, and the cover photo the closing slide echoes.
 */
function slideRenderKey(savedJson: string, index: number): string {
  let saved: CarouselState;
  try {
    saved = JSON.parse(savedJson) as CarouselState;
  } catch {
    return "0";
  }
  const slide = saved.slides?.[index];
  if (!slide) return "0";
  const cover = slide.kind === "cta" ? saved.slides.find((x) => x.kind === "cover")?.image?.url ?? null : null;
  const step = saved.slides.slice(0, index + 1).filter((x) => x.kind === "content").length;
  const input = JSON.stringify([slide, saved.template, saved.format, saved.handle, saved.accent, saved.slides.length, step, cover]);
  // FNV-1a, 32 bits: a cache key, not a security measure.
  let h = 0x811c9dc5;
  for (let k = 0; k < input.length; k++) {
    h ^= input.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Accent colours offered per carousel — bright enough to pop on a photo. */
const ACCENTS = [
  { hex: "#FFC21A", label: "Jaune" },
  { hex: "#2EA8FF", label: "Bleu" },
  { hex: "#FF3B3B", label: "Rouge" },
  { hex: "#22D46B", label: "Vert" },
  { hex: "#FF4FA3", label: "Rose" },
  { hex: "#FFFFFF", label: "Blanc" },
];

/** The cover choice that leaves the headline to the carousel AI. */
const AI_COVER = "__ai__";
/** AI images each length usually needs: one per slide but the closing one. */
const TYPICAL_IMAGES: Record<CarouselLength, number> = { single: 1, short: 3, full: 5 };
const LENGTHS: { value: CarouselLength; title: string; hint: string }[] = [
  { value: "single", title: "1 image", hint: "Un post unique avec un message fort. Le moins cher." },
  { value: "short", title: "4 slides", hint: "Couverture, 2 idées clés et une fin qui fait agir." },
  { value: "full", title: "6 slides", hint: "La réponse dès la 2e slide, puis la preuve et quoi faire." },
];
/** The length an existing carousel was made at, so rewriting its text keeps it. */
function lengthOf(slides: CarouselState["slides"]): CarouselLength {
  if (slides.length === 1) return "single";
  return slides.filter((s) => s.kind === "content").length <= CONTENT_SLIDES.short ? "short" : "full";
}

export function CarouselEditor({ projectId, projectTitle, initial, brand, hasScript, script, cost, socialCopyCost, aiImageCost, credits: initialCredits, aiConfigured, stockConfigured, aiImagesConfigured, posted, admin, review, characterReference, defaultStyle, scriptStart }: Props) {
  const [marking, setMarking] = useState(false);
  const [unmarking, setUnmarking] = useState(false);
  async function unmarkPosted() {
    setUnmarking(true);
    const res = await unmarkProjectPosted(projectId);
    setUnmarking(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Marque « publié » retirée.");
    router.refresh();
  }
  const router = useRouter();
  const [state, setState] = useState<CarouselState | null>(initial ? withoutVersion(initial) : null);
  // Not read: setting it re-renders after a save, so the slide URLs pick up the new saved state.
  const [, setVersion] = useState(initial?.version ?? 0);
  const [credits, setCredits] = useState(initialCredits);
  const [generating, setGenerating] = useState(false);
  /** Whether the initial text generation is in flight — the only automatic step; visuals are a deliberate follow-up once the script has been read. */
  const [phase, setPhase] = useState<null | "text" | "images">(null);
  const [createVisuals, setCreateVisuals] = useState<"ai" | "stock">(aiImagesConfigured ? "ai" : "stock");
  const [createStyle, setCreateStyle] = useState<VisualStyle>(defaultStyle);
  const [createLength, setCreateLength] = useState<CarouselLength>(script?.carouselLength ?? "full");
  /** The cover headlines the script offers (its hook and alternatives) that fit on a cover. */
  const coverOptions = script ? [...new Set([script.hook, ...script.alternativeHooks].map((h) => h.trim()))].filter((h) => h && h.length <= SLIDE_LIMITS.cover.title) : [];
  // A script written for a carousel has cover headlines as hooks: its first one is the default. A video's spoken hook is not, so the AI adapts it.
  const [coverChoice, setCoverChoice] = useState<string>(script?.carouselLength && coverOptions[0] ? coverOptions[0] : AI_COVER);
  // A script written or edited while this screen is open (the "D'abord, le script" step, or "Modifier") brings its own length and covers.
  const scriptKey = script?.id;
  useEffect(() => {
    if (!script) return;
    if (script.carouselLength) setCreateLength(script.carouselLength);
    const options = [...new Set([script.hook, ...script.alternativeHooks].map((h) => h.trim()))].filter((h) => h && h.length <= SLIDE_LIMITS.cover.title);
    setCoverChoice(script.carouselLength && options[0] ? options[0] : AI_COVER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptKey]);
  const [visualsBusy, setVisualsBusy] = useState(false);
  const [filling, setFilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<null | "share" | "download" | "zip">(null);
  const [textsOpen, setTextsOpen] = useState(false);
  /** Image model test, admin only — shared with the video studio. Clients get Nano Banana 2. */
  const [imageModel, setImageModel] = useAdminImageModel(admin);
  /** Tapping a slide in the preview opens its text, where it can be changed. */
  function editSlide(id: string) {
    setTextsOpen(true);
    requestAnimationFrame(() => document.getElementById(`slide-text-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  const [canShareFiles, setCanShareFiles] = useState(false);
  const lastSaved = useRef(initial ? JSON.stringify(withoutVersion(initial)) : "");
  const dirty = state !== null && JSON.stringify(state) !== lastSaved.current;

  // Sharing files is a phone capability; checked after mount so server and client render the same markup.
  useEffect(() => {
    try {
      const probe = new File([new Blob()], "probe.jpg", { type: "image/jpeg" });
      setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  /** Saves and returns the version the slide images must now be fetched at, or null on failure. */
  const persist = useCallback(
    async (next: CarouselState): Promise<number | null> => {
      const snapshot = JSON.stringify(next);
      setSaving(true);
      const res = await saveCarouselAction(projectId, next);
      setSaving(false);
      if (!res.ok) {
        toast.error(res.error);
        return null;
      }
      lastSaved.current = snapshot;
      setVersion(res.data.version);
      return res.data.version;
    },
    [projectId],
  );

  useEffect(() => {
    if (!state || !dirty) return;
    const t = setTimeout(() => void persist(state), 900);
    return () => clearTimeout(t);
  }, [state, dirty, persist]);

  /**
   * A slide's preview URL is keyed on what that slide renders from, in the
   * last saved state — not on the carousel's version. Keyed on the version,
   * every autosave made the browser fetch every slide again, and the server
   * download every photo again from storage to draw them: a few minutes of
   * typing cost hundreds of megabytes of storage traffic. Now only the slides
   * whose own content changed are drawn again.
   *
   * `r` is the renderer's revision: bumped when a fix changes what a saved
   * carousel renders to, so a slide the browser cached before it is redrawn.
   */
  const slideUrl = (i: number, download = false) => `/api/carousels/${projectId}/slides/${i}?v=${slideRenderKey(lastSaved.current, i)}&r=${RENDER_REVISION}${download ? "&download=1" : ""}`;

  /** Take a carousel the server just wrote as the editor's state, as saved. */
  function apply(snapshot: CarouselSnapshot) {
    const next = withoutVersion(snapshot);
    lastSaved.current = JSON.stringify(next);
    setState(next);
    setVersion(snapshot.version);
  }

  /**
   * Ask the server for the AI visuals and take back only the images: text
   * typed while they were being made stays, and the autosave then persists
   * both together.
   */
  async function requestVisuals(mode: "missing" | "all"): Promise<boolean> {
    const res = await generateCarouselVisualsAction(projectId, mode, admin ? imageModel : undefined);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    const snapshot = res.data.carousel;
    const images = new Map(snapshot.slides.map((s) => [s.id, s]));
    lastSaved.current = JSON.stringify(withoutVersion(snapshot));
    setVersion(snapshot.version);
    setCredits(res.data.creditsLeft);
    setState((prev) =>
      prev ? { ...prev, visualStyle: snapshot.visualStyle, slides: prev.slides.map((s) => (images.has(s.id) ? { ...s, image: images.get(s.id)!.image ?? null, draftImage: images.get(s.id)!.draftImage ?? null } : s)) } : withoutVersion(snapshot),
    );
    const { generated, failed, tooLong } = res.data;
    toast.success(
      `${generated} visuel${generated > 1 ? "s" : ""} créé${generated > 1 ? "s" : ""}` +
        (failed ? ` · ${failed} échec${failed > 1 ? "s" : ""}, crédits remboursés — ${mode === "all" ? "ces slides gardent leur image précédente" : "relance pour les compléter"}` : "") +
        (tooLong ? ` · ${tooLong} slide${tooLong > 1 ? "s" : ""} trop longue${tooLong > 1 ? "s" : ""} pour une image` : ""),
    );
    return true;
  }

  async function generateVisuals(mode: "missing" | "all") {
    if (!state) return;
    setVisualsBusy(true);
    try {
      if (dirty && (await persist(state)) === null) return;
      await requestVisuals(mode);
    } finally {
      setVisualsBusy(false);
    }
  }

  /**
   * A first creation with AI visuals chains straight into the images: the
   * script is already shown on the creation screen, and that screen promises
   * one image per slide. A rewrite of an existing carousel stops after the
   * text, so the new wording can be read before paying for new images.
   */
  async function generate() {
    const ai = aiImagesConfigured && (state ? state.visualStyle !== null : createVisuals === "ai");
    const visualStyle = state?.visualStyle ?? createStyle;
    const firstCreation = !state;
    if (state) {
      const message = ai
        ? `Réécrire tous les textes ? ${cost} crédit${cost > 1 ? "s" : ""}. Les images actuelles seront à remplacer ensuite (${aiImageCost} par image) une fois le nouveau texte relu. Le modèle, le format, la signature et le style sont conservés.`
        : "Réécrire tous les textes du carrousel ? De nouvelles photos sont cherchées pour chaque slide ; le modèle, le format et la signature sont conservés.";
      if (!window.confirm(message)) return;
    }
    setGenerating(true);
    setPhase("text");
    try {
      const length = state ? lengthOf(state.slides) : createLength;
      // A rewrite follows the (possibly edited) script; only the first creation offers the cover pick.
      const coverHeadline = !state && coverChoice !== AI_COVER ? coverChoice : null;
      const res = await generateCarouselAction(projectId, { visuals: ai ? "ai" : "stock", visualStyle, length, coverHeadline });
      if (!res.ok) return toast.error(res.error);
      apply(res.data.carousel);
      setCredits(res.data.creditsLeft);
      if (ai && firstCreation) {
        setPhase("images");
        await requestVisuals("missing");
        router.refresh();
        return;
      }
      toast.success(
        ai
          ? `Script prêt · ${res.data.carousel.slides.length} slides${cost > 0 ? ` · ${cost} crédits` : ""}. Relis-le, puis génère les images dans « Visuels ».`
          : `Carrousel prêt · ${res.data.carousel.slides.length} slides${cost > 0 ? ` · ${cost} crédits` : ""}`,
      );
      router.refresh();
    } finally {
      setGenerating(false);
      setPhase(null);
    }
  }

  /** A photo on every slide that has none; photos already placed and all text stay. */
  async function fillPhotos() {
    if (!state) return;
    if (!state.slides.some((s) => s.kind !== "cta" && !s.image)) {
      return toast.info("Toutes les slides ont déjà une photo. Retires-en une pour la remplacer.");
    }
    setFilling(true);
    try {
      if (dirty && (await persist(state)) === null) return;
      const res = await fillCarouselPhotosAction(projectId);
      if (!res.ok) return toast.error(res.error);
      const result = withoutVersion(res.data.carousel);
      const images = new Map(result.slides.map((s) => [s.id, s.image]));
      // Only the photos come from the server: text typed while it searched stays,
      // and the autosave then persists both together.
      lastSaved.current = JSON.stringify(result);
      setVersion(res.data.carousel.version);
      setState((prev) => (prev ? { ...prev, slides: prev.slides.map((s) => (images.has(s.id) ? { ...s, image: images.get(s.id) ?? null } : s)) } : prev));

      const { changed, tooLong, unmatched } = res.data;
      if (!changed) return toast.info(tooLong ? "Aucune photo ajoutée : les slides vides ont trop de texte pour une photo." : "Aucune photo trouvée pour ces slides. Essaie la recherche manuelle sur une slide.");
      toast.success(
        `${changed} photo${changed > 1 ? "s" : ""} ajoutée${changed > 1 ? "s" : ""}.` +
          (unmatched > 0 ? ` ${unmatched} slide${unmatched > 1 ? "s" : ""} sans résultat — cherche manuellement.` : "") +
          (tooLong > 0 ? ` ${tooLong} slide${tooLong > 1 ? "s" : ""} trop longue${tooLong > 1 ? "s" : ""} pour une photo.` : ""),
      );
    } finally {
      setFilling(false);
    }
  }

  /**
   * The slides of the saved carousel — saving first, so the export always
   * matches what is on screen.
   *
   * For the phone (share sheet and downloads) they come as photos: JPEGs
   * dated one second apart, slide 1 the newest, so a newest-first gallery —
   * Instagram's and TikTok's pickers — lists them in reading order instead
   * of breaking a same-second tie at random. The ZIP keeps lossless PNGs.
   */
  async function collectFiles(as: "photos" | "png" = "photos"): Promise<File[] | null> {
    if (!state) return null;
    // Saving first updates the saved state the slide URLs are keyed on.
    if (dirty && (await persist(state)) === null) return null;
    const takenAt = Date.now();
    return Promise.all(
      state.slides.map(async (_, i) => {
        const res = await fetch(slideUrl(i));
        if (!res.ok) throw new Error(`La slide ${i + 1} n'a pas pu être générée.`);
        const png = await res.blob();
        if (as === "png") return new File([png], slideFileName(projectTitle, state.format, i), { type: "image/png" });
        const jpeg = withCaptureDate(await slideAsJpeg(png), new Date(takenAt - i * 1000));
        return new File([jpeg as BlobPart], slideFileName(projectTitle, state.format, i, "jpg"), { type: "image/jpeg" });
      }),
    );
  }

  async function share() {
    setBusy("share");
    try {
      const files = await collectFiles();
      if (!files) return;
      await navigator.share({ files, title: projectTitle });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // the user closed the share sheet
      toast.error(err instanceof Error ? err.message : "Partage impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadImages() {
    setBusy("download");
    let progress: string | number | undefined;
    try {
      const files = await collectFiles();
      if (!files) return;
      // Android dates a download to the second, and galleries (Instagram's
      // picker included) break a tie between same-second files arbitrarily —
      // slides saved 350 ms apart came out shuffled in small groups. Over a
      // second apart, each gets its own timestamp; and saving the last slide
      // first makes slide 1 the newest, so a newest-first gallery lists them
      // 1, 2, 3… in reading order, ready to tap in sequence.
      progress = toast.loading(`Téléchargement 1/${files.length}…`);
      for (const [k, file] of [...files].reverse().entries()) {
        toast.loading(`Téléchargement ${k + 1}/${files.length}…`, { id: progress });
        triggerDownload(file, file.name);
        if (k < files.length - 1) await new Promise((r) => setTimeout(r, 1200));
      }
      toast.success(`${files.length} images téléchargées. Dans ta galerie, la slide 1 est en premier : sélectionne-les dans l'ordre d'affichage.`, { id: progress });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Téléchargement impossible.", { id: progress });
    } finally {
      setBusy(null);
    }
  }

  async function downloadZip() {
    setBusy("zip");
    try {
      if (!state) return;
      const format = state.format;
      const files = await collectFiles("png");
      if (!files) return;
      const entries = Object.fromEntries(await Promise.all(files.map(async (f) => [f.name, new Uint8Array(await f.arrayBuffer())] as const)));
      // PNGs are already compressed; storing them avoids burning the phone's CPU for nothing.
      const zipped = zipSync(entries, { level: 0 });
      triggerDownload(new Blob([zipped], { type: "application/zip" }), zipFileName(projectTitle, format));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Téléchargement impossible.");
    } finally {
      setBusy(null);
    }
  }

  const set = (patch: Partial<CarouselState>) => setState((s) => (s ? { ...s, ...patch } : s));
  const patchSlide = (id: string, patch: Partial<CarouselSlide>) => setState((s) => (s ? { ...s, slides: s.slides.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : s));
  const removeSlide = (id: string) => setState((s) => (s ? { ...s, slides: s.slides.filter((x) => x.id !== id) } : s));
  const moveSlide = (id: string, dir: -1 | 1) =>
    setState((s) => {
      if (!s) return s;
      const i = s.slides.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || !s.slides[j] || s.slides[j].kind !== "content") return s;
      const slides = [...s.slides];
      [slides[i], slides[j]] = [slides[j], slides[i]];
      return { ...s, slides };
    });
  const addSlide = () =>
    setState((s) => {
      if (!s) return s;
      const ctaAt = s.slides.findIndex((x) => x.kind === "cta");
      const slides = [...s.slides];
      slides.splice(ctaAt < 0 ? slides.length : ctaAt, 0, { id: nanoid(8), kind: "content", kicker: "", title: "Nouvelle idée", body: "", action: "", imageQuery: "", imagePrompt: "", emphasis: "", image: null });
      return { ...s, slides };
    });

  const header = (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Projets
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">Carrousel</h1>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{projectTitle}</p>
      </div>
      <FormatSwitcher projectId={projectId} active="carousel" />
    </div>
  );

  if (generating && phase) {
    return (
      <div className="mx-auto max-w-3xl min-w-0">
        {header}
        <CreationProgress phase={phase} />
      </div>
    );
  }

  if (!state) {
    if (!hasScript) {
      return (
        <div className="mx-auto max-w-3xl min-w-0">
          {header}
          <ScriptStart projectId={projectId} topic={scriptStart.topic} niche={scriptStart.niche} language={scriptStart.language} cost={scriptStart.cost} credits={credits} aiConfigured={aiConfigured} />
        </div>
      );
    }
    const ai = aiImagesConfigured && createVisuals === "ai";
    const images = TYPICAL_IMAGES[createLength];
    const estimate = cost + (ai ? aiImageCost * images : 0);
    return (
      <div className="mx-auto max-w-3xl min-w-0">
        {header}
        <div className="surface space-y-5 p-5">
          <div>
            <GalleryHorizontalEnd className="h-6 w-6 text-brand-300" />
            <h2 className="mt-2 font-display text-lg font-bold">Transforme ton script en carrousel</h2>
            <p className="mt-1 text-sm text-muted-foreground">Une couverture qui arrête le scroll, une idée par slide, une fin qui pousse à enregistrer et à partager.</p>
          </div>

          {script && <ScriptCard key={script.id} script={script} label="Script — relis-le et corrige-le avant de générer" />}
          {review && <ReviewCard report={review.report} tally={review.tally} />}

          <div className="space-y-2">
            <Label>Format du post</Label>
            <div className="grid grid-cols-3 gap-2">
              {LENGTHS.map((l) => (
                <ChoiceCard key={l.value} selected={createLength === l.value} onClick={() => setCreateLength(l.value)} title={l.title}>
                  {l.hint}
                </ChoiceCard>
              ))}
            </div>
          </div>

          {script?.carouselLength && script.carouselLength !== createLength && (
            <p className="-mt-3 text-[11px] text-amber-300">Le script a été écrit pour {LENGTHS.find((l) => l.value === script.carouselLength)?.title}. L'IA l'adaptera, mais le résultat est meilleur avec le format prévu.</p>
          )}

          {script && (
            <div className="space-y-2">
              <Label>{createLength === "single" ? "Le message du post" : "Couverture"}</Label>
              <p className="text-[11px] text-muted-foreground">C'est elle qui décide si on s'arrête. Choisis celle qui t'arrêterait, toi.</p>
              <div className="grid gap-2">
                {coverOptions.map((headline) => (
                  <CoverChoice key={headline} selected={coverChoice === headline} onClick={() => setCoverChoice(headline)}>{headline}</CoverChoice>
                ))}
                <CoverChoice selected={coverChoice === AI_COVER} onClick={() => setCoverChoice(AI_COVER)} muted>
                  Laisser l'IA l'écrire à partir du script
                </CoverChoice>
              </div>
            </div>
          )}

          {aiImagesConfigured && (
            <div className="space-y-2">
              <Label>Visuels</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <ChoiceCard selected={createVisuals === "ai"} onClick={() => setCreateVisuals("ai")} title="Images IA en série" badge="Recommandé">
                  Une image créée pour chaque slide, dans un seul style et un même décor : le carrousel se lit comme une vraie série.
                </ChoiceCard>
                <ChoiceCard selected={createVisuals === "stock"} onClick={() => setCreateVisuals("stock")} title="Banque d'images">
                  Photos Pexels et Pixabay. Gratuit, mais chaque photo garde son propre style.
                </ChoiceCard>
              </div>
            </div>
          )}

          {ai && admin && (
            <ImageModelPicker value={imageModel} onChange={setImageModel} note="Visible par toi seul ; tes clients sont sur Nano Banana 2. Le même choix reste ensuite dans l'éditeur et dans le studio vidéo." />
          )}

          {ai && (
            <div className="space-y-2">
              <Label>Direction artistique</Label>
              <StylePicker value={createStyle} onChange={setCreateStyle} />
            </div>
          )}

          <div>
            <Button variant="gradient" className="w-full" onClick={generate} disabled={!aiConfigured || credits < estimate}>
              <Sparkles /> {createLength === "single" ? "Créer le post" : "Créer le carrousel"} {estimate > 0 && <><Coins className="h-3.5 w-3.5" /> {ai ? `≈ ${estimate}` : estimate}</>}
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {ai
                ? `${cost} crédits pour le texte, puis ${aiImageCost} par image (${createLength === "single" ? "1 image" : `environ ${images}`}). Une image qui échoue est remboursée.`
                : "Des photos sont cherchées pour chaque slide, gratuitement."}
            </p>
            {credits < estimate && <p className="mt-1 text-xs text-red-300">Crédits insuffisants ({credits}/{estimate}). <Link href="/billing" className="underline">Recharger</Link></p>}
          </div>
        </div>
      </div>
    );
  }

  const { width, height } = FORMAT_SIZE[state.format];
  const contentCount = state.slides.filter((s) => s.kind === "content").length;
  const photoSlots = state.slides.filter((s) => s.kind !== "cta").length;
  const photoCount = state.slides.filter((s) => s.kind !== "cta" && s.image).length;
  const style = state.visualStyle ?? defaultStyle;
  const hasCast = Boolean(characterReference.own || characterReference.space);
  /** The prompt this slide's image would be drawn with here (lib/carousel/ai-visuals promptFor), for the Gemini app. */
  const geminiFor = (slide: CarouselSlide) => {
    const layout = imageLayout(slide.kind, state.template);
    return { prompt: geminiPrompt(composeImagePrompt({ scene: imageSceneOf(slide), motif: state.visualMotif, style, layout }), { aspect: imageAspect(layout, state.format), cast: hasCast }), cast: hasCast };
  };
  const pendingVisuals = state.slides.filter((s) => needsAiVisual(s, style) && !tooLongForImage(s, state.template)).length;
  const regenerable = state.slides.filter((s) => s.kind !== "cta" && !tooLongForImage(s, state.template)).length;
  const aiCount = state.slides.filter((s) => imageOrigin(s.image) === "ai").length;
  /** Before an AI generation touches a slide the server reads it from the database, so unsaved edits go first. */
  const ensureSaved = async () => !dirty || (await persist(state)) !== null;
  let contentIndex = 0;

  return (
    <div className="mx-auto max-w-3xl min-w-0 pb-16">
      {header}

      {/* Swipe through the real rendered images, the way they will appear in the feed. */}
      <div className="relative min-w-0">
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {state.slides.map((s, i) => (
            <button
              type="button"
              key={`${slideRenderKey(lastSaved.current, i)}-${s.id}`}
              onClick={() => editSlide(s.id)}
              aria-label={`Modifier le texte de la slide ${i + 1}`}
              className="relative shrink-0 snap-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
              style={{ width: "min(76vw, 300px)", aspectRatio: `${width} / ${height}` }}
            >
              <div className="absolute inset-0 animate-pulse bg-white/[0.03]" />
              <img src={slideUrl(i)} alt={`Slide ${i + 1}`} className="absolute inset-0 h-full w-full" loading={i < 3 ? "eager" : "lazy"} />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
                <Pencil className="h-3 w-3" /> Modifier
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{state.slides.length === 1 ? "Post unique · touche l'image pour modifier son texte" : `${state.slides.length} slides · touche une slide pour modifier son texte`}</span>
          {(dirty || saving) && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <Loader2 className="h-3 w-3 animate-spin" /> Mise à jour de l'aperçu…
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {canShareFiles && (
          <Button variant="gradient" onClick={share} loading={busy === "share"} disabled={busy !== null}>
            <Share2 /> Publier / partager les images
          </Button>
        )}
        <Button variant={canShareFiles ? "secondary" : "gradient"} onClick={downloadImages} loading={busy === "download"} disabled={busy !== null}>
          <Download /> Télécharger les images
        </Button>
        <Button variant="ghost" size="sm" className={cn("text-xs", canShareFiles ? "sm:col-span-2" : "")} onClick={downloadZip} loading={busy === "zip"} disabled={busy !== null}>
          <Archive /> Tout télécharger en ZIP
        </Button>
        {posted ? (
          <Button variant="secondary" size="sm" className="border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15 sm:col-span-2" loading={unmarking} onClick={unmarkPosted}>
            {!unmarking && <CheckCircle2 />} Publié{posted.platforms.length ? ` sur ${posted.platforms.map((p) => POST_PLATFORM_LABELS[p as PostPlatform] ?? p).join(", ")}` : ""} <Undo2 className="h-3.5 w-3.5 opacity-60" />
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className="sm:col-span-2" onClick={() => setMarking(true)}>
            <CheckCircle2 /> Marquer publié
          </Button>
        )}
        {posted && <ResultsButton projectId={projectId} title={projectTitle} format="carousel" platforms={posted.platforms} className="sm:col-span-2" />}
      </div>
      {marking && <MarkPostedDialog projectId={projectId} title={projectTitle} open={marking} onOpenChange={setMarking} />}

      <div className="mt-5 space-y-3">
        <Section title="Design" icon={Palette} summary={`${resolveTemplate(state.template, brand, state.accent).name} · ${FORMAT_SIZE[state.format].label}`} defaultOpen>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Modèle</Label>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {CAROUSEL_TEMPLATES.map((id) => {
                  const t = resolveTemplate(id, brand, state.accent);
                  const selected = state.template === id;
                  const poster = t.headlineFont === "Anton" || t.headlineFont === "Barlow Condensed";
                  const photo = `linear-gradient(180deg, #6b4a2b 0%, #2a1c12 45%, ${t.background} 75%)`;
                  return (
                    <button key={id} type="button" onClick={() => set({ template: id })} className={cn("rounded-lg border p-1 text-left transition", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                      {id === "boxed" ? (
                        // A photo with the caption box at its foot, the way the slides are laid out.
                        <div className="flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-md p-1" style={{ background: "linear-gradient(160deg, #d9432f 0%, #8c2b1f 55%, #3a1510 100%)" }}>
                          <div className="flex flex-col gap-1 rounded bg-black/85 px-1.5 py-1.5">
                            <div className="h-0.5 w-3 rounded-full" style={{ background: t.accent }} />
                            <span className="text-sm font-black uppercase leading-none" style={{ color: t.text, fontFamily: "Impact, 'Arial Narrow Bold', 'Arial Narrow', sans-serif" }}>Aa <span style={{ color: t.accent }}>Aa</span></span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex aspect-[4/5] flex-col justify-center gap-1.5 overflow-hidden rounded-md px-1.5" style={{ background: poster ? photo : t.background }}>
                          <div className="h-1 w-5 rounded-full" style={{ background: t.accent }} />
                          <span
                            className={cn("leading-none", poster ? "text-base uppercase" : "text-lg font-extrabold")}
                            style={{ color: t.text, fontFamily: poster ? "Impact, 'Arial Narrow Bold', 'Arial Narrow', sans-serif" : t.headlineFont === "Playfair Display" ? "Georgia, 'Times New Roman', serif" : "inherit" }}
                          >
                            Aa
                          </span>
                          <div className="h-1 w-4/5 rounded-full" style={{ background: t.muted }} />
                        </div>
                      )}
                      <p className="mt-1 truncate text-[11px] font-medium">{t.name}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Couleur d'accent</Label>
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Couleur d'accent">
                <button
                  type="button"
                  role="radio"
                  aria-checked={state.accent === null}
                  onClick={() => set({ accent: null })}
                  className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition", state.accent === null ? "border-primary/60 bg-primary/10 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20")}
                >
                  <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: brand.accent }} /> Marque
                </button>
                {ACCENTS.map((a) => (
                  <button
                    key={a.hex}
                    type="button"
                    role="radio"
                    aria-checked={state.accent === a.hex}
                    aria-label={a.label}
                    title={a.label}
                    onClick={() => set({ accent: a.hex })}
                    className={cn("flex h-9 w-9 items-center justify-center rounded-full border-2 transition", state.accent === a.hex ? "border-white" : "border-transparent hover:border-white/30")}
                  >
                    <span className="h-6 w-6 rounded-full" style={{ background: a.hex }} />
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Les mots clés, les numéros et les boutons. « Marque » reprend la couleur de ta page Marque.</p>
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <div className="grid grid-cols-3 gap-2">
                {CAROUSEL_FORMATS.map((f) => (
                  <button key={f} type="button" onClick={() => set({ format: f })} className={cn("rounded-lg border p-2.5 text-center transition", state.format === f ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                    <p className="text-sm font-semibold">{FORMAT_SIZE[f].label}</p>
                    <p className="text-[11px] text-muted-foreground">{FORMAT_SIZE[f].hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Signature</Label>
              <Input value={state.handle ?? ""} maxLength={40} placeholder="@toncompte" onChange={(e) => set({ handle: e.target.value || null })} />
              <p className="text-[11px] text-muted-foreground">Affichée en haut de chaque slide et sur la dernière.</p>
            </div>
          </div>
        </Section>

        <Section title="Visuels" icon={ImageIcon} summary={`${photoCount} / ${photoSlots} slides${aiCount ? ` · ${aiCount} IA` : ""}`} defaultOpen>
          {aiImagesConfigured ? (
            <div className="space-y-4">
              {/* Both settings below only steer the AI: without this, they read as settings of the photos in general. */}
              <div className="rounded-lg border border-brand-400/25 bg-brand-500/[0.07] p-3">
                <p className="flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4 text-brand-300" /> Génération d'images IA</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  La direction artistique et le fil conducteur servent uniquement quand l'IA crée les images ({aiImageCost > 0 ? `${aiImageCost} crédits par image` : "gratuit sur ce compte"}). Les photos de banque et tes propres photos ne les utilisent pas.
                </p>
              </div>

              {admin && (
                <ImageModelPicker value={imageModel} onChange={setImageModel} note="Visible par toi seul ; tes clients sont sur Nano Banana 2. Choisis un modèle, puis « Tout régénérer » pour comparer sur le même carrousel. S'applique aussi au bouton de génération de chaque slide, et au studio vidéo.">
                  <a href={`/api/admin/carousel-images/${projectId}`} target="_blank" rel="noreferrer" className="inline-flex text-[11px] font-semibold text-amber-200 underline">
                    Diagnostiquer les images de ce carrousel
                  </a>
                </ImageModelPicker>
              )}

              <div className="space-y-2">
                <Label>Direction artistique <span className="font-normal normal-case text-muted-foreground">· le style des images IA</span></Label>
                <StylePicker value={style} onChange={(v) => set({ visualStyle: v })} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><Label>Fil conducteur <span className="font-normal normal-case text-muted-foreground">· le décor et qui apparaît</span></Label><Counter value={state.visualMotif} max={VISUAL_MOTIF_MAX} /></div>
                <Textarea
                  value={state.visualMotif}
                  maxLength={VISUAL_MOTIF_MAX}
                  rows={2}
                  placeholder="Ex. : chaque aliment présenté dans une cuillère en bois, au-dessus d'un verger flou"
                  onChange={(e) => set({ visualMotif: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  {state.slides.length === 1
                    ? "La personne, le lieu et les objets de ton image IA."
                    : "La personne récurrente et le décor communs à toutes les images IA du carrousel : c'est ce qui en fait une série plutôt qu'une suite d'images sans rapport."}{" "}
                  Il s'applique à la prochaine génération : les images déjà créées ne changent pas tant que tu ne les régénères pas.
                </p>
              </div>
              <CharacterReference projectId={projectId} initial={characterReference} generate={{ description: state.visualMotif, cost: aiImageCost, enabled: aiImagesConfigured }} />

              {pendingVisuals > 0 ? (
                <Button variant="gradient" className="w-full" onClick={() => generateVisuals("missing")} loading={visualsBusy} disabled={generating || filling || busy !== null || credits < pendingVisuals * aiImageCost}>
                  <Wand2 /> Générer {pendingVisuals} visuel{pendingVisuals > 1 ? "s" : ""} IA {aiImageCost > 0 && <><Coins className="h-3.5 w-3.5" /> {pendingVisuals * aiImageCost}</>}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => window.confirm(`Recréer les ${regenerable} images du carrousel ? ${regenerable * aiImageCost} crédits.`) && generateVisuals("all")}
                  loading={visualsBusy}
                  disabled={generating || filling || busy !== null || regenerable === 0 || credits < regenerable * aiImageCost}
                >
                  <RefreshCw /> Tout régénérer {aiImageCost > 0 && <><Coins className="h-3.5 w-3.5" /> {regenerable * aiImageCost}</>}
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">
                {pendingVisuals > 0
                  ? "Les photos de banque et les images d'un autre style sont remplacées ; tes propres photos restent. La couverture est créée d'abord et sert de référence de lumière et de couleurs aux autres."
                  : "Toutes les images sont dans ce style. Pour en changer une seule : touche la slide dans l'aperçu."}
              </p>
              {!fullBleedTemplate(state.template) && (
                <p className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-2.5 text-[11px] text-amber-200">
                  Les modèles Immersif et Encadré mettent chaque visuel en plein écran.{" "}
                  <button type="button" className="font-semibold underline" onClick={() => set({ template: "immersive" })}>Passer en Immersif</button>
                </p>
              )}
              {stockConfigured && photoCount < photoSlots && (
                <div className="border-t border-white/[0.06] pt-3">
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={fillPhotos} loading={filling} disabled={generating || visualsBusy || busy !== null}>
                    <ImagePlus /> Remplir les slides vides avec la banque d'images (gratuit)
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Ajoute une photo sur chaque slide qui n'en a pas. Les photos déjà en place et les textes ne bougent pas.</p>
              <Button variant="gradient" className="mt-3 w-full" onClick={fillPhotos} loading={filling} disabled={!stockConfigured || generating || busy !== null}>
                <Sparkles /> Remplir les slides vides
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">{stockConfigured ? "Gratuit. Pour changer une photo précise : touche la slide dans l'aperçu, puis Changer." : "La recherche de photos n'est pas configurée."}</p>
            </>
          )}
        </Section>

        <Section title="Textes des slides" icon={Type} count={state.slides.length} open={textsOpen} onOpenChange={setTextsOpen}>
          <div className="space-y-3">
            {state.slides.map((s, i) => {
              if (s.kind === "content") contentIndex++;
              return (
                <SlideEditor
                  key={s.id}
                  imageModel={admin ? imageModel : undefined}
                  anchorId={`slide-text-${s.id}`}
                  projectId={projectId}
                  slide={s}
                  template={state.template}
                  label={s.kind === "cover" ? "Couverture" : s.kind === "cta" ? "Dernière slide" : `Idée ${pad(contentIndex)}`}
                  canDelete={s.kind === "content" && contentCount > 1}
                  canMoveUp={s.kind === "content" && state.slides[i - 1]?.kind === "content"}
                  canMoveDown={s.kind === "content" && state.slides[i + 1]?.kind === "content"}
                  aiImageCost={aiImageCost}
                  aiImagesConfigured={aiImagesConfigured}
                  credits={credits}
                  ensureSaved={ensureSaved}
                  // "Copier la description" is the owner's alone (see visuals-panel).
                  gemini={admin && s.kind !== "cta" ? geminiFor(s) : null}
                  onGenerated={(generatedStyle, creditsLeft) => {
                    setCredits(creditsLeft);
                    if (!state.visualStyle) set({ visualStyle: generatedStyle });
                  }}
                  onChange={(patch) => patchSlide(s.id, patch)}
                  onRemove={() => removeSlide(s.id)}
                  onMove={(dir) => moveSlide(s.id, dir)}
                />
              );
            })}
            {contentCount < MAX_CONTENT_SLIDES && (
              <Button variant="outline" size="sm" className="w-full" onClick={addSlide}>
                <Plus /> Ajouter une slide
              </Button>
            )}
          </div>
        </Section>

        {script && (
          <Section title="Description du post" icon={MessageSquareText} summary="TikTok & Instagram">
            <SocialCopyBlock scriptId={script.id} copy={script.socialCopy} hashtags={script.hashtags} cost={socialCopyCost} aiConfigured={aiConfigured} />
          </Section>
        )}

        <Section title="Script et réécriture" icon={RefreshCw} summary="Modifier le script, réécrire">
          {script && <div className="mb-3"><ScriptCard key={script.id} script={script} label="Script du projet" hint="Tu as modifié le script ? Réécris le carrousel ci-dessous pour que les slides le suivent. Pour retoucher une seule slide, ouvre « Textes des slides »." /></div>}
          {review && <div className="mb-3"><ReviewCard report={review.report} tally={review.tally} /></div>}
          <p className="text-xs text-muted-foreground">
            Repart du script actuel du projet et réécrit tous les textes.{" "}
            {aiImagesConfigured && state.visualStyle ? `Les visuels IA sont recréés dans le même style (${aiImageCost} crédits par image).` : "De nouvelles photos sont cherchées pour chaque slide."} Le modèle, le format et la signature sont conservés.
          </p>
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={generate} loading={generating} disabled={!aiConfigured || !hasScript || credits < cost || filling}>
            <Sparkles /> Réécrire le carrousel {cost > 0 && <><Coins className="h-3.5 w-3.5" /> {cost}</>}
          </Button>
        </Section>
      </div>
    </div>
  );
}

/** A rendered PNG slide as JPEG bytes — the format a phone gallery treats as a photo, with a capture date. */
async function slideAsJpeg(png: Blob): Promise<Uint8Array> {
  const url = URL.createObjectURL(png);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) throw new Error("Conversion de l'image impossible.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={cn("text-[10px] tabular-nums", value.length > max ? "font-semibold text-red-300" : value.length >= max * 0.9 ? "text-amber-300" : "text-muted-foreground")}>{value.length}/{max}</span>;
}

/** One slide. Limits come from what the layout can hold — tight for a band photo, the full room for a full-bleed one — so a slide within them never overflows. */
function SlideEditor({ imageModel, anchorId, projectId, slide, template, label, canDelete, canMoveUp, canMoveDown, aiImageCost, aiImagesConfigured, credits, ensureSaved, gemini, onGenerated, onChange, onRemove, onMove }: {
  imageModel?: ImageModelChoice;
  anchorId: string;
  projectId: string;
  slide: CarouselSlide;
  template: CarouselTemplate;
  label: string;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  aiImageCost: number;
  aiImagesConfigured: boolean;
  credits: number;
  ensureSaved: () => Promise<boolean>;
  /** The slide's full image prompt for the Gemini app; null on a slide without an image. */
  gemini: { prompt: string; cast: boolean } | null;
  onGenerated: (style: VisualStyle, creditsLeft: number) => void;
  onChange: (patch: Partial<CarouselSlide>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const limit = limitsFor(slide, template);
  // A band photo takes part of a content slide, so it only fits once the text is short enough — a full-bleed one never blocks on this.
  const tooLongForPhoto = !slide.image && tooLongForImage(slide, template);
  // Text written for a full-bleed template keeps every word after a switch to a band one; it just has to be shortened to fit beside the photo.
  const overflowsBand = Boolean(slide.image) && tooLongForImage(slide, template);
  const emphasisMissing = Boolean(slide.emphasis.trim()) && !slide.title.toLowerCase().includes(slide.emphasis.trim().toLowerCase());

  return (
    <div id={anchorId} className="scroll-mt-20 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <div className="flex gap-0.5">
          {canMoveUp && <Button size="icon-sm" variant="ghost" aria-label="Monter" onClick={() => onMove(-1)}><ArrowUp /></Button>}
          {canMoveDown && <Button size="icon-sm" variant="ghost" aria-label="Descendre" onClick={() => onMove(1)}><ArrowDown /></Button>}
          {canDelete && <Button size="icon-sm" variant="ghost" aria-label="Supprimer la slide" className="text-red-300" onClick={onRemove}><Trash2 /></Button>}
        </div>
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between"><Label className="text-[11px]">{slide.kind === "content" ? "Étiquette (facultatif)" : "Étiquette"}</Label><Counter value={slide.kicker} max={limit.kicker} /></div>
          <Input value={slide.kicker} maxLength={limit.kicker} className="h-8 text-xs" onChange={(e) => onChange({ kicker: e.target.value })} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between"><Label className="text-[11px]">Titre</Label><Counter value={slide.title} max={limit.title} /></div>
          <Textarea value={slide.title} maxLength={limit.title} rows={2} className="font-medium" onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Mots en couleur</Label>
            {emphasisMissing && <span className="text-[10px] text-amber-300">absents du titre</span>}
          </div>
          <Input value={slide.emphasis} maxLength={60} className="h-8 text-xs" placeholder="1 à 3 mots copiés du titre" onChange={(e) => onChange({ emphasis: e.target.value })} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between"><Label className="text-[11px]">Texte</Label><Counter value={slide.body} max={limit.body} /></div>
          <Textarea value={slide.body} maxLength={limit.body} rows={slide.kind === "cta" ? 2 : 3} onChange={(e) => onChange({ body: e.target.value })} />
        </div>
        {overflowsBand && (
          <p className="rounded-lg border border-red-300/20 bg-red-300/5 p-2 text-[11px] text-red-200">
            Trop long pour ce modèle : la photo prend une partie de la slide. Raccourcis le titre à {IMAGE_SLIDE_LIMITS.title} et le texte à {IMAGE_SLIDE_LIMITS.body} caractères, ou repasse en Immersif où tout tient.
          </p>
        )}
        {slide.kind === "cta" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between"><Label className="text-[11px] text-brand-300">Appel à l'action</Label><Counter value={slide.action} max={limit.action} /></div>
            <Textarea value={slide.action} maxLength={limit.action} rows={2} placeholder="Ex. : Commente « GO » et je t'envoie la méthode complète." onChange={(e) => onChange({ action: e.target.value })} />
            <p className="text-[10px] text-muted-foreground">Affiché dans l'encadré avec les boutons Enregistre · Partage · Commente, au-dessus de ton compte.</p>
          </div>
        )}
        {slide.kind !== "cta" && (
          <ImageControl
            imageModel={imageModel}
            projectId={projectId}
            slide={slide}
            aiImageCost={aiImageCost}
            aiImagesConfigured={aiImagesConfigured}
            credits={credits}
            ensureSaved={ensureSaved}
            gemini={gemini}
            onGenerated={onGenerated}
            onDraft={(draftImage) => onChange({ draftImage })}
            onUseDraft={() => slide.draftImage && onChange({ image: slide.draftImage, draftImage: slide.image })}
            onPromptChange={(imagePrompt) => onChange({ imagePrompt })}
            blockedReason={tooLongForPhoto ? `Pour ajouter une image, raccourcis le titre à ${IMAGE_SLIDE_LIMITS.title} et le texte à ${IMAGE_SLIDE_LIMITS.body} caractères : l'image prend une partie de la slide.` : null}
            // A stock photo taken off is remembered so "Remplir" never proposes it again.
            onChange={(image) => onChange(image === null && slide.image?.source?.startsWith("http") ? { image, draftImage: null, rejectedImages: [...(slide.rejectedImages ?? []), slide.image.source].slice(-40) } : { image, draftImage: null })}
          />
        )}
      </div>
    </div>
  );
}

interface StockHit {
  id: string;
  url: string;
  thumbnailUrl: string;
}

/**
 * Downscale and re-encode a phone photo as JPEG before upload.
 *
 * The slide renderer draws JPEG and PNG only, and phones hand over HEIC,
 * WebP and 12-megapixel files. Going through a canvas fixes all three: the
 * browser decodes whatever it can display, and the result is a sensible size.
 */
async function toJpeg(file: File): Promise<File> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Ton navigateur ne sait pas lire ce format de photo. Essaie une photo JPEG ou PNG."));
      el.src = src;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Conversion de la photo impossible.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("Conversion de la photo impossible.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** Image of one slide: an AI visual in the carousel's art direction, a stock photo, or the user's own. */
function ImageControl({ imageModel, projectId, slide, aiImageCost, aiImagesConfigured, credits, blockedReason, ensureSaved, gemini, onGenerated, onDraft, onUseDraft, onPromptChange, onChange }: {
  imageModel?: ImageModelChoice;
  projectId: string;
  slide: CarouselSlide;
  aiImageCost: number;
  aiImagesConfigured: boolean;
  credits: number;
  blockedReason: string | null;
  ensureSaved: () => Promise<boolean>;
  gemini: { prompt: string; cast: boolean } | null;
  onGenerated: (style: VisualStyle, creditsLeft: number) => void;
  /** The AI's first drawing, when an automatic correction replaced it (null otherwise). */
  onDraft: (draft: CarouselSlide["image"]) => void;
  /** Swap the image and its first drawing. */
  onUseDraft: () => void;
  onPromptChange: (prompt: string) => void;
  onChange: (image: CarouselSlide["image"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(!aiImagesConfigured);
  const [query, setQuery] = useState(slide.imageQuery || slide.title);
  const [hits, setHits] = useState<StockHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const origin = imageOrigin(slide.image);

  async function generateAi() {
    setGeneratingAi(true);
    try {
      // The server reads the slide and the carousel's style from the database.
      if (!(await ensureSaved())) return;
      const res = await generateSlideImageAction(projectId, slide.id, slide.imagePrompt, imageModel);
      if (!res.ok) return toast.error(res.error);
      onChange({ url: res.data.url, source: res.data.source });
      onDraft(res.data.draftUrl ? { url: res.data.draftUrl, source: res.data.source } : null);
      onGenerated(res.data.visualStyle, res.data.creditsLeft);
      if (res.data.draftUrl) toast.info("Une retouche automatique a été faite. La 1re version est gardée : « Remettre la 1re version » sous l'image.");
      setOpen(false);
    } finally {
      setGeneratingAi(false);
    }
  }

  async function search(q = query) {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/stock/search?type=image&q=${encodeURIComponent(q.trim())}`);
      const data = (await res.json()) as { results?: StockHit[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Recherche impossible.");
      setHits(data.results ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recherche impossible.");
    } finally {
      setSearching(false);
    }
  }

  function openStock() {
    setStockOpen(true);
    if (!hits) void search();
  }

  function togglePanel() {
    if (open) return setOpen(false);
    setOpen(true);
    if (stockOpen && !hits) void search();
  }

  async function pick(hit: StockHit) {
    setImporting(hit.id);
    const res = await importCarouselImageAction(projectId, hit.url);
    setImporting(null);
    if (!res.ok) return toast.error(res.error);
    onChange({ url: res.data.url, source: res.data.source });
    setOpen(false);
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const asset = await uploadAsset(await toJpeg(file));
      onChange({ url: asset.url });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi de la photo impossible.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const originLabel = origin === "ai" ? "IA" : origin === "stock" ? "Banque" : origin === "upload" ? "Ta photo" : null;

  return (
    <div className="space-y-2 border-t border-white/[0.06] pt-2">
      <div className="flex items-center gap-2">
        {slide.image ? (
          <img src={slide.image.url} alt="" className="h-12 w-10 shrink-0 rounded object-cover" />
        ) : (
          <div className="flex h-12 w-10 shrink-0 items-center justify-center rounded border border-dashed border-white/15 text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-medium">
            {slide.kind === "cover" ? "Image de fond" : "Image"}
            {originLabel && <span className={cn("rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide", origin === "ai" ? "bg-primary/20 text-brand-200" : "bg-white/[0.08] text-muted-foreground")}>{originLabel}</span>}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">{slide.image ? "Visible sur la slide" : "Aucune — le design seul"}</p>
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={Boolean(blockedReason)} onClick={togglePanel}>
          <ImagePlus /> {slide.image ? "Changer" : "Ajouter"}
        </Button>
        {slide.image && (
          <Button size="icon-sm" variant="ghost" aria-label="Retirer l'image" className="text-red-300" onClick={() => onChange(null)}><Trash2 /></Button>
        )}
      </div>
      {blockedReason && <p className="text-[10px] text-amber-300">{blockedReason}</p>}
      {slide.image && slide.draftImage && (
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5">
          <img src={slide.draftImage.url} alt="" className="h-10 w-8 shrink-0 rounded object-cover" />
          <p className="min-w-0 flex-1 text-[10px] leading-snug text-muted-foreground">L&apos;IA a retouché cette image toute seule. La 1re version est gardée.</p>
          <Button size="sm" variant="secondary" className="h-auto min-h-7 px-2 py-1 text-[10px] leading-tight" onClick={onUseDraft}>Remettre la 1re version</Button>
        </div>
      )}

      {open && (
        <div className="space-y-3 rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
          {aiImagesConfigured && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label className="text-[11px]">Scène à illustrer</Label><Counter value={slide.imagePrompt} max={IMAGE_PROMPT_MAX} /></div>
              <Textarea
                value={slide.imagePrompt}
                maxLength={IMAGE_PROMPT_MAX}
                rows={3}
                className="text-xs"
                placeholder="Ex. : un bol de bouillon fumant posé sur une table en bois, près d'une fenêtre"
                onChange={(e) => onPromptChange(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Décris le sujet, pas le style : la direction artistique et le fil conducteur s'ajoutent tout seuls.</p>
              <Button size="sm" variant="gradient" className="w-full text-[11px]" loading={generatingAi} disabled={credits < aiImageCost} onClick={generateAi}>
                <Wand2 /> {origin === "ai" ? "Régénérer" : "Générer"} avec l'IA {aiImageCost > 0 && <><Coins className="h-3 w-3" /> {aiImageCost}</>}
              </Button>
              {credits < aiImageCost && <p className="text-[10px] text-amber-300">Crédits insuffisants pour générer une image.</p>}
            </div>
          )}
          {gemini && (
            <div className="space-y-1">
              <CopyForGemini prompt={gemini.prompt} cast={gemini.cast} className="w-full" />
              <p className="text-[10px] text-muted-foreground">À coller dans Gemini ou ChatGPT (avec ta fiche personnages), puis « Ma photo » pour importer l&apos;image ici.</p>
            </div>
          )}

          {aiImagesConfigured && !stockOpen ? (
            <div className="grid grid-cols-2 gap-1.5 border-t border-white/[0.06] pt-2.5">
              <Button size="sm" variant="outline" className="text-[11px]" onClick={openStock}><Search /> Banque d'images</Button>
              <Button size="sm" variant="outline" className="text-[11px]" loading={uploading} onClick={() => fileRef.current?.click()}><Upload /> Ma photo</Button>
            </div>
          ) : (
            <div className={cn("space-y-2", aiImagesConfigured && "border-t border-white/[0.06] pt-2.5")}>
              <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void search(); }}>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex. : woman journaling" className="h-8 text-xs" />
                <Button type="submit" size="icon-sm" variant="secondary" aria-label="Rechercher" loading={searching}><Search /></Button>
              </form>
              <p className="text-[10px] text-muted-foreground">Pexels et Pixabay — les mots-clés en anglais donnent plus de résultats.</p>
              {hits && hits.length === 0 && !searching && <p className="py-3 text-center text-[11px] text-muted-foreground">Aucune photo trouvée. Essaie des mots plus simples et concrets.</p>}
              {hits && hits.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {hits.slice(0, 12).map((h) => (
                    <button key={h.id} type="button" onClick={() => pick(h)} disabled={importing !== null} className="relative aspect-[4/5] overflow-hidden rounded-md border border-white/10 transition hover:border-primary/60 disabled:opacity-60">
                      <img src={h.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      {importing === h.id && <span className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="h-4 w-4 animate-spin" /></span>}
                    </button>
                  ))}
                </div>
              )}
              <Button size="sm" variant="outline" className="w-full text-[11px]" loading={uploading} onClick={() => fileRef.current?.click()}>
                <Upload /> Importer ma propre photo
              </Button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
      )}
    </div>
  );
}

/** One cover headline to pick, set in the slides' display face so it reads as the cover it will be. */
function CoverChoice({ selected, onClick, muted, children }: { selected: boolean; onClick: () => void; muted?: boolean; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick} className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
      <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary" : "border-white/30")}>{selected && <Check className="h-3 w-3 text-white" />}</span>
      <span className={cn(muted ? "text-xs text-muted-foreground" : "font-display text-sm font-bold uppercase leading-snug tracking-tight")}>{children}</span>
    </button>
  );
}

function ChoiceCard({ selected, onClick, title, badge, children }: { selected: boolean; onClick: () => void; title: string; badge?: string; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={cn("rounded-xl border p-3 text-left transition", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary" : "border-white/30")}>{selected && <Check className="h-3 w-3 text-white" />}</span>
        {title}
        {badge && <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-200">{badge}</span>}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </button>
  );
}

function CreationProgress({ phase }: { phase: "text" | "images" }) {
  return (
    <div className="surface flex items-center gap-3 p-5">
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-300" />
      <div>
        <p className="font-display text-base font-bold">{phase === "text" ? "Écriture des slides" : "Création des images"}</p>
        <p className="text-sm text-muted-foreground">
          {phase === "text"
            ? "Titres, textes, mots en couleur et scènes à illustrer — reste sur cette page."
            : "La couverture d'abord, puis les autres slides dans le même style — jusqu'à une minute, reste sur cette page."}
        </p>
      </div>
    </div>
  );
}
