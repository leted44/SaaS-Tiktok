"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowDown, ArrowUp, Check, Coins, Download, Archive, GalleryHorizontalEnd, ImageIcon, ImagePlus, Loader2, MessageSquareText, Palette, Plus, RefreshCw, Search, Share2, Sparkles, Trash2, Type, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { zipSync } from "fflate";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/shared/empty-state";
import { SocialCopyBlock } from "@/components/studio/social-copy";
import { generateCarouselAction, generateCarouselVisualsAction, generateSlideImageAction, importCarouselImageAction, fillCarouselPhotosAction, saveCarouselAction, type CarouselSnapshot } from "@/server/actions/carousels";
import { uploadAsset } from "@/lib/assets/upload-client";
import { CAROUSEL_FORMATS, CAROUSEL_TEMPLATES, FORMAT_SIZE, IMAGE_SLIDE_LIMITS, imageOrigin, limitsFor, needsAiVisual, slideFileSlug, tooLongForImage, type CarouselSlide, type CarouselState } from "@/lib/carousel/schema";
import { DEFAULT_VISUAL_STYLE, type VisualStyle } from "@/lib/carousel/art-direction";
import { StylePicker } from "@/components/shared/style-picker";
import { resolveTemplate } from "@/lib/carousel/templates";
import { FormatSwitcher } from "@/components/studio/format-switcher";
import type { SocialCopy } from "@/lib/social/captions";
import { cn } from "@/lib/utils";

const MAX_CONTENT_SLIDES = 8;

interface Props {
  projectId: string;
  projectTitle: string;
  initial: CarouselSnapshot | null;
  brand: { primary: string; accent: string };
  hasScript: boolean;
  script: { id: string; hashtags: string[]; socialCopy: SocialCopy } | null;
  cost: number;
  socialCopyCost: number;
  aiImageCost: number;
  credits: number;
  aiConfigured: boolean;
  stockConfigured: boolean;
  aiImagesConfigured: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const withoutVersion = (s: CarouselSnapshot): CarouselState => ({ template: s.template, format: s.format, handle: s.handle, slides: s.slides, visualStyle: s.visualStyle, visualMotif: s.visualMotif });
/** Images a new AI carousel usually needs: the cover and six content slides. */
const TYPICAL_IMAGES = 7;

export function CarouselEditor({ projectId, projectTitle, initial, brand, hasScript, script, cost, socialCopyCost, aiImageCost, credits: initialCredits, aiConfigured, stockConfigured, aiImagesConfigured }: Props) {
  const router = useRouter();
  const [state, setState] = useState<CarouselState | null>(initial ? withoutVersion(initial) : null);
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [credits, setCredits] = useState(initialCredits);
  const [generating, setGenerating] = useState(false);
  /** Where a creation stands: the text is written first, then the visuals, as two requests. */
  const [phase, setPhase] = useState<null | "text" | "visuals">(null);
  const [createVisuals, setCreateVisuals] = useState<"ai" | "stock">(aiImagesConfigured ? "ai" : "stock");
  const [createStyle, setCreateStyle] = useState<VisualStyle>(DEFAULT_VISUAL_STYLE);
  const [visualsBusy, setVisualsBusy] = useState(false);
  const [filling, setFilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<null | "share" | "download" | "zip">(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const lastSaved = useRef(initial ? JSON.stringify(withoutVersion(initial)) : "");
  const dirty = state !== null && JSON.stringify(state) !== lastSaved.current;

  // Sharing files is a phone capability; checked after mount so server and client render the same markup.
  useEffect(() => {
    try {
      const probe = new File([new Blob()], "probe.png", { type: "image/png" });
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

  const slideUrl = (i: number, v: number, download = false) => `/api/carousels/${projectId}/slides/${i}?v=${v}${download ? "&download=1" : ""}`;

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
    const res = await generateCarouselVisualsAction(projectId, mode);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    const snapshot = res.data.carousel;
    const images = new Map(snapshot.slides.map((s) => [s.id, s.image]));
    lastSaved.current = JSON.stringify(withoutVersion(snapshot));
    setVersion(snapshot.version);
    setCredits(res.data.creditsLeft);
    setState((prev) =>
      prev ? { ...prev, visualStyle: snapshot.visualStyle, slides: prev.slides.map((s) => (images.has(s.id) ? { ...s, image: images.get(s.id) ?? null } : s)) } : withoutVersion(snapshot),
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

  async function generate() {
    const ai = aiImagesConfigured && (state ? state.visualStyle !== null : createVisuals === "ai");
    const visualStyle = state?.visualStyle ?? createStyle;
    if (state) {
      const message = ai
        ? `Réécrire tous les textes et recréer les visuels IA ? ${cost} crédits pour le texte, puis ${aiImageCost} par image. Le modèle, le format, la signature et le style sont conservés.`
        : "Réécrire tous les textes du carrousel ? De nouvelles photos sont cherchées pour chaque slide ; le modèle, le format et la signature sont conservés.";
      if (!window.confirm(message)) return;
    }
    setGenerating(true);
    setPhase("text");
    try {
      const res = await generateCarouselAction(projectId, { visuals: ai ? "ai" : "stock", visualStyle });
      if (!res.ok) return toast.error(res.error);
      apply(res.data.carousel);
      setCredits(res.data.creditsLeft);
      if (ai) {
        setPhase("visuals");
        await requestVisuals("missing");
      } else {
        toast.success(`Carrousel prêt · ${res.data.carousel.slides.length} slides${cost > 0 ? ` · ${cost} crédits` : ""}`);
      }
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

  /** The PNGs of the saved carousel — saving first, so the export always matches what is on screen. */
  async function collectFiles(): Promise<File[] | null> {
    if (!state) return null;
    let v = version;
    if (dirty) {
      const saved = await persist(state);
      if (saved === null) return null;
      v = saved;
    }
    const slug = slideFileSlug(projectTitle);
    return Promise.all(
      state.slides.map(async (_, i) => {
        const res = await fetch(slideUrl(i, v));
        if (!res.ok) throw new Error(`La slide ${i + 1} n'a pas pu être générée.`);
        return new File([await res.blob()], `${slug}-slide-${pad(i + 1)}.png`, { type: "image/png" });
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
      const files = await collectFiles();
      if (!files) return;
      const entries = Object.fromEntries(await Promise.all(files.map(async (f) => [f.name, new Uint8Array(await f.arrayBuffer())] as const)));
      // PNGs are already compressed; storing them avoids burning the phone's CPU for nothing.
      const zipped = zipSync(entries, { level: 0 });
      triggerDownload(new Blob([zipped], { type: "application/zip" }), `${slideFileSlug(projectTitle)}.zip`);
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
        <CreationProgress phase={phase} withVisuals={aiImagesConfigured && (state ? state.visualStyle !== null : createVisuals === "ai")} />
      </div>
    );
  }

  if (!state) {
    if (!hasScript) {
      return (
        <div className="mx-auto max-w-3xl min-w-0">
          {header}
          <EmptyState
            icon={GalleryHorizontalEnd}
            title="Transforme ton script en carrousel"
            description="Il faut d'abord un script dans ce projet : le carrousel est écrit à partir de lui."
            action={<Button asChild variant="secondary"><Link href={`/studio/${projectId}`}>Retour au studio</Link></Button>}
          />
        </div>
      );
    }
    const ai = aiImagesConfigured && createVisuals === "ai";
    const estimate = cost + (ai ? aiImageCost * TYPICAL_IMAGES : 0);
    return (
      <div className="mx-auto max-w-3xl min-w-0">
        {header}
        <div className="surface space-y-5 p-5">
          <div>
            <GalleryHorizontalEnd className="h-6 w-6 text-brand-300" />
            <h2 className="mt-2 font-display text-lg font-bold">Transforme ton script en carrousel</h2>
            <p className="mt-1 text-sm text-muted-foreground">Une couverture qui arrête le scroll, une idée par slide, une fin qui pousse à enregistrer et à partager.</p>
          </div>

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

          {ai && (
            <div className="space-y-2">
              <Label>Direction artistique</Label>
              <StylePicker value={createStyle} onChange={setCreateStyle} />
            </div>
          )}

          <div>
            <Button variant="gradient" className="w-full" onClick={generate} disabled={!aiConfigured || credits < estimate}>
              <Sparkles /> Créer le carrousel {estimate > 0 && <><Coins className="h-3.5 w-3.5" /> {ai ? `≈ ${estimate}` : estimate}</>}
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {ai
                ? `${cost} crédits pour le texte, puis ${aiImageCost} par image (environ ${TYPICAL_IMAGES}). Une image qui échoue est remboursée.`
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
  const style = state.visualStyle ?? DEFAULT_VISUAL_STYLE;
  const pendingVisuals = state.slides.filter((s) => needsAiVisual(s, style) && !tooLongForImage(s)).length;
  const regenerable = state.slides.filter((s) => s.kind !== "cta" && !tooLongForImage(s)).length;
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
            <div
              key={`${version}-${s.id}`}
              className="relative shrink-0 snap-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
              style={{ width: "min(76vw, 300px)", aspectRatio: `${width} / ${height}` }}
            >
              <div className="absolute inset-0 animate-pulse bg-white/[0.03]" />
              <img src={slideUrl(i, version)} alt={`Slide ${i + 1}`} className="absolute inset-0 h-full w-full" loading={i < 3 ? "eager" : "lazy"} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{state.slides.length} slides · glisse pour les parcourir</span>
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
      </div>

      <div className="mt-5 space-y-3">
        <Section title="Design" icon={Palette} summary={`${resolveTemplate(state.template, brand).name} · ${FORMAT_SIZE[state.format].label}`} defaultOpen>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Modèle</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {CAROUSEL_TEMPLATES.map((id) => {
                  const t = resolveTemplate(id, brand);
                  const selected = state.template === id;
                  const poster = t.headlineFont === "Anton";
                  return (
                    <button key={id} type="button" onClick={() => set({ template: id })} className={cn("rounded-lg border p-1 text-left transition", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                      <div
                        className="flex aspect-[4/5] flex-col justify-center gap-1.5 overflow-hidden rounded-md px-1.5"
                        style={{ background: poster ? `linear-gradient(180deg, #6b4a2b 0%, #2a1c12 45%, ${t.background} 75%)` : t.background }}
                      >
                        <div className="h-1 w-5 rounded-full" style={{ background: t.accent }} />
                        <span
                          className={cn("leading-none", poster ? "text-base uppercase" : "text-lg font-extrabold")}
                          style={{ color: t.text, fontFamily: poster ? "Impact, 'Arial Narrow Bold', 'Arial Narrow', sans-serif" : t.headlineFont === "Playfair Display" ? "Georgia, 'Times New Roman', serif" : "inherit" }}
                        >
                          Aa
                        </span>
                        <div className="h-1 w-4/5 rounded-full" style={{ background: t.muted }} />
                      </div>
                      <p className="mt-1 truncate text-[11px] font-medium">{t.name}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">Les couleurs viennent de ta marque (page Marque).</p>
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
              <div className="space-y-2">
                <Label>Direction artistique</Label>
                <StylePicker value={style} onChange={(v) => set({ visualStyle: v })} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><Label>Fil conducteur</Label><Counter value={state.visualMotif} max={300} /></div>
                <Textarea
                  value={state.visualMotif}
                  maxLength={300}
                  rows={2}
                  placeholder="Ex. : chaque aliment présenté dans une cuillère en bois, au-dessus d'un verger flou"
                  onChange={(e) => set({ visualMotif: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">Le décor commun à toutes les images. C'est lui qui en fait une série plutôt qu'une suite de photos sans rapport.</p>
              </div>

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
                  : "Toutes les images sont dans ce style. Pour en changer une seule : ouvre la slide dans Textes."}
              </p>
              {state.template !== "immersive" && (
                <p className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-2.5 text-[11px] text-amber-200">
                  Le modèle Immersif met chaque visuel en plein écran, avec un fond sombre continu d'une slide à l'autre.{" "}
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
              <p className="mt-2 text-[11px] text-muted-foreground">{stockConfigured ? "Gratuit. Pour changer une photo précise : ouvre la slide dans Textes, puis Changer." : "La recherche de photos n'est pas configurée."}</p>
            </>
          )}
        </Section>

        <Section title="Textes" icon={Type} count={state.slides.length}>
          <div className="space-y-3">
            {state.slides.map((s, i) => {
              if (s.kind === "content") contentIndex++;
              return (
                <SlideEditor
                  key={s.id}
                  projectId={projectId}
                  slide={s}
                  label={s.kind === "cover" ? "Couverture" : s.kind === "cta" ? "Dernière slide" : `Idée ${pad(contentIndex)}`}
                  canDelete={s.kind === "content" && contentCount > 1}
                  canMoveUp={s.kind === "content" && state.slides[i - 1]?.kind === "content"}
                  canMoveDown={s.kind === "content" && state.slides[i + 1]?.kind === "content"}
                  aiImageCost={aiImageCost}
                  aiImagesConfigured={aiImagesConfigured}
                  credits={credits}
                  ensureSaved={ensureSaved}
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

        <Section title="Réécrire avec l'IA" icon={RefreshCw} summary={cost > 0 ? `${cost} crédits` : undefined}>
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
  return <span className={cn("text-[10px] tabular-nums", value.length >= max * 0.9 ? "text-amber-300" : "text-muted-foreground")}>{value.length}/{max}</span>;
}

/** One slide. Limits come from what the layout can hold in its tightest format, so a slide within them never overflows. */
function SlideEditor({ projectId, slide, label, canDelete, canMoveUp, canMoveDown, aiImageCost, aiImagesConfigured, credits, ensureSaved, onGenerated, onChange, onRemove, onMove }: {
  projectId: string;
  slide: CarouselSlide;
  label: string;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  aiImageCost: number;
  aiImagesConfigured: boolean;
  credits: number;
  ensureSaved: () => Promise<boolean>;
  onGenerated: (style: VisualStyle, creditsLeft: number) => void;
  onChange: (patch: Partial<CarouselSlide>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const limit = limitsFor(slide);
  // An image takes part of a content slide, so it only fits once the text is short enough.
  const tooLongForPhoto = !slide.image && tooLongForImage(slide);
  const emphasisMissing = Boolean(slide.emphasis.trim()) && !slide.title.toLowerCase().includes(slide.emphasis.trim().toLowerCase());

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
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
        {slide.kind === "cta" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between"><Label className="text-[11px] text-brand-300">Appel à l'action</Label><Counter value={slide.action} max={limit.action} /></div>
            <Textarea value={slide.action} maxLength={limit.action} rows={2} placeholder="Ex. : Commente « GO » et je t'envoie la méthode complète." onChange={(e) => onChange({ action: e.target.value })} />
            <p className="text-[10px] text-muted-foreground">Affiché dans l'encadré avec les boutons Enregistre · Partage · Commente, au-dessus de ton compte.</p>
          </div>
        )}
        {slide.kind !== "cta" && (
          <ImageControl
            projectId={projectId}
            slide={slide}
            aiImageCost={aiImageCost}
            aiImagesConfigured={aiImagesConfigured}
            credits={credits}
            ensureSaved={ensureSaved}
            onGenerated={onGenerated}
            onPromptChange={(imagePrompt) => onChange({ imagePrompt })}
            blockedReason={tooLongForPhoto ? `Pour ajouter une image, raccourcis le titre à ${IMAGE_SLIDE_LIMITS.title} et le texte à ${IMAGE_SLIDE_LIMITS.body} caractères : l'image prend une partie de la slide.` : null}
            // A stock photo taken off is remembered so "Remplir" never proposes it again.
            onChange={(image) => onChange(image === null && slide.image?.source?.startsWith("http") ? { image, rejectedImages: [...(slide.rejectedImages ?? []), slide.image.source].slice(-40) } : { image })}
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
function ImageControl({ projectId, slide, aiImageCost, aiImagesConfigured, credits, blockedReason, ensureSaved, onGenerated, onPromptChange, onChange }: {
  projectId: string;
  slide: CarouselSlide;
  aiImageCost: number;
  aiImagesConfigured: boolean;
  credits: number;
  blockedReason: string | null;
  ensureSaved: () => Promise<boolean>;
  onGenerated: (style: VisualStyle, creditsLeft: number) => void;
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
      const res = await generateSlideImageAction(projectId, slide.id, slide.imagePrompt);
      if (!res.ok) return toast.error(res.error);
      onChange({ url: res.data.url, source: res.data.source });
      onGenerated(res.data.visualStyle, res.data.creditsLeft);
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

      {open && (
        <div className="space-y-3 rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
          {aiImagesConfigured && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label className="text-[11px]">Scène à illustrer</Label><Counter value={slide.imagePrompt} max={600} /></div>
              <Textarea
                value={slide.imagePrompt}
                maxLength={600}
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

/** Creating is two requests — the writing, then the images — shown as the two steps they are. */
function CreationProgress({ phase, withVisuals }: { phase: "text" | "visuals"; withVisuals: boolean }) {
  const steps = [
    { id: "text", label: "Écriture des slides", hint: "Titres, textes, mots en couleur et scènes à illustrer" },
    ...(withVisuals ? [{ id: "visuals", label: "Création des visuels", hint: "La couverture d'abord, puis toutes les images dans son style — environ 30 secondes" }] : []),
  ];
  const at = steps.findIndex((s) => s.id === phase);
  return (
    <div className="surface space-y-4 p-5">
      <div>
        <p className="font-display text-lg font-bold">Ton carrousel se prépare</p>
        <p className="text-sm text-muted-foreground">Reste sur cette page, ça ne prend qu'un moment.</p>
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.id} className="flex gap-3">
            <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", i < at ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300" : i === at ? "border-primary/60 bg-primary/15 text-brand-200" : "border-white/10 text-muted-foreground")}>
              {i < at ? <Check className="h-3.5 w-3.5" /> : i === at ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-[11px]">{i + 1}</span>}
            </span>
            <div>
              <p className={cn("text-sm font-medium", i > at && "text-muted-foreground")}>{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
