"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowDown, ArrowUp, Coins, Download, Archive, GalleryHorizontalEnd, Loader2, MessageSquareText, Palette, Plus, RefreshCw, Share2, Sparkles, Trash2, Type } from "lucide-react";
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
import { generateCarouselAction, saveCarouselAction, type CarouselSnapshot } from "@/server/actions/carousels";
import { CAROUSEL_FORMATS, CAROUSEL_TEMPLATES, FORMAT_SIZE, SLIDE_LIMITS, type CarouselSlide, type CarouselState } from "@/lib/carousel/schema";
import { resolveTemplate } from "@/lib/carousel/templates";
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
  credits: number;
  aiConfigured: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const withoutVersion = (s: CarouselSnapshot): CarouselState => ({ template: s.template, format: s.format, handle: s.handle, slides: s.slides });

export function CarouselEditor({ projectId, projectTitle, initial, brand, hasScript, script, cost, socialCopyCost, credits, aiConfigured }: Props) {
  const router = useRouter();
  const [state, setState] = useState<CarouselState | null>(initial ? withoutVersion(initial) : null);
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [generating, setGenerating] = useState(false);
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

  async function generate() {
    if (state && !window.confirm("Réécrire tous les textes du carrousel ? Le design (modèle, format, signature) est conservé.")) return;
    setGenerating(true);
    const res = await generateCarouselAction(projectId);
    setGenerating(false);
    if (!res.ok) return toast.error(res.error);
    const next = withoutVersion(res.data.carousel);
    lastSaved.current = JSON.stringify(next);
    setState(next);
    setVersion(res.data.carousel.version);
    toast.success(`Carrousel prêt · ${next.slides.length} slides${cost > 0 ? ` · ${cost} crédits` : ""}`);
    router.refresh();
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
    return Promise.all(
      state.slides.map(async (_, i) => {
        const res = await fetch(slideUrl(i, v));
        if (!res.ok) throw new Error(`La slide ${i + 1} n'a pas pu être générée.`);
        return new File([await res.blob()], `slide-${pad(i + 1)}.png`, { type: "image/png" });
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
    try {
      const files = await collectFiles();
      if (!files) return;
      for (const file of files) {
        triggerDownload(file, file.name);
        // Browsers drop rapid-fire downloads; a short gap lets each one through.
        await new Promise((r) => setTimeout(r, 350));
      }
      toast.success(`${files.length} images téléchargées — elles apparaissent dans ta galerie.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Téléchargement impossible.");
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
      triggerDownload(new Blob([zipped], { type: "application/zip" }), "carrousel.zip");
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
      slides.splice(ctaAt < 0 ? slides.length : ctaAt, 0, { id: nanoid(8), kind: "content", kicker: "", title: "Nouvelle idée", body: "" });
      return { ...s, slides };
    });

  const header = (
    <div className="mb-5">
      <Link href={`/studio/${projectId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Retour au studio
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">Carrousel</h1>
      <p className="mt-0.5 truncate text-sm text-muted-foreground">{projectTitle}</p>
    </div>
  );

  if (!state) {
    return (
      <div className="mx-auto max-w-3xl min-w-0">
        {header}
        <EmptyState
          icon={GalleryHorizontalEnd}
          title="Transforme ton script en carrousel"
          description={
            hasScript
              ? "L'IA réécrit ton idée pour être lue slide par slide : une couverture qui donne envie de glisser, une idée par slide, une fin qui pousse à enregistrer."
              : "Il faut d'abord un script dans ce projet : le carrousel est écrit à partir de lui."
          }
          action={
            hasScript ? (
              <Button variant="gradient" onClick={generate} loading={generating} disabled={!aiConfigured || credits < cost}>
                <Sparkles /> Créer le carrousel {cost > 0 && <><Coins className="h-3.5 w-3.5" /> {cost}</>}
              </Button>
            ) : (
              <Button asChild variant="secondary"><Link href={`/studio/${projectId}`}>Retour au studio</Link></Button>
            )
          }
        />
        {hasScript && credits < cost && <p className="mt-3 text-center text-xs text-red-300">Crédits insuffisants ({credits}/{cost}). <Link href="/billing" className="underline">Recharger</Link></p>}
      </div>
    );
  }

  const { width, height } = FORMAT_SIZE[state.format];
  const contentCount = state.slides.filter((s) => s.kind === "content").length;
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
              <div className="grid grid-cols-4 gap-2">
                {CAROUSEL_TEMPLATES.map((id) => {
                  const t = resolveTemplate(id, brand);
                  const selected = state.template === id;
                  return (
                    <button key={id} type="button" onClick={() => set({ template: id })} className={cn("rounded-lg border p-1.5 text-left transition", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                      <div className="flex aspect-[4/5] flex-col justify-center gap-1.5 overflow-hidden rounded-md px-2" style={{ background: t.background }}>
                        <div className="h-1 w-5 rounded-full" style={{ background: t.accent }} />
                        <span className="text-lg font-extrabold leading-none" style={{ color: t.text, fontFamily: t.headlineFont === "Playfair Display" ? "Georgia, 'Times New Roman', serif" : "inherit" }}>
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

        <Section title="Textes" icon={Type} count={state.slides.length}>
          <div className="space-y-3">
            {state.slides.map((s, i) => {
              if (s.kind === "content") contentIndex++;
              return (
                <SlideEditor
                  key={s.id}
                  slide={s}
                  label={s.kind === "cover" ? "Couverture" : s.kind === "cta" ? "Dernière slide" : `Idée ${pad(contentIndex)}`}
                  canDelete={s.kind === "content" && contentCount > 1}
                  canMoveUp={s.kind === "content" && state.slides[i - 1]?.kind === "content"}
                  canMoveDown={s.kind === "content" && state.slides[i + 1]?.kind === "content"}
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
          <p className="text-xs text-muted-foreground">Repart du script actuel du projet et réécrit tous les textes. Le modèle, le format et la signature sont conservés.</p>
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={generate} loading={generating} disabled={!aiConfigured || !hasScript || credits < cost}>
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

/** One slide's text. Limits come from what the layout can hold in its tightest format, so a slide within them never overflows. */
function SlideEditor({ slide, label, canDelete, canMoveUp, canMoveDown, onChange, onRemove, onMove }: {
  slide: CarouselSlide;
  label: string;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<CarouselSlide>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const limit = SLIDE_LIMITS[slide.kind];
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
          <div className="flex items-center justify-between"><Label className="text-[11px]">Texte</Label><Counter value={slide.body} max={limit.body} /></div>
          <Textarea value={slide.body} maxLength={limit.body} rows={3} onChange={(e) => onChange({ body: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
