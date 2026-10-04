"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, ImagePlus, Lightbulb, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { POST_PLATFORMS, POST_PLATFORM_LABELS, type PostPlatform } from "@/lib/projects/progress";
import { emptyMetrics, METRIC_KEYS, METRIC_LABELS, type PostFormat, type PostMetrics } from "@/lib/results/metrics";
import { deleteResultAction, projectResultsAction, readResultScreenshotsAction, saveResultAction, type SavedResult } from "@/server/actions/results";
import { cn } from "@/lib/utils";

const MAX_SHOTS = 3;

/** A phone screenshot is several MB; read at 1600 px it is as legible and uploads in a second. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

const toText = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
const toNumber = (s: string): number | null => {
  const clean = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Where a creator gives a post's results: a few screenshots of its statistics
 * (read by the AI, checked here before saving) or the numbers typed in. Saving
 * returns the post's diagnosis and updates the account's lessons.
 */
export function ResultsDialog({ projectId, title, format, platforms, open, onOpenChange }: { projectId: string; title: string; format: PostFormat; platforms: string[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const initialPlatform = (POST_PLATFORMS as readonly string[]).includes(platforms[0] ?? "") ? (platforms[0] as PostPlatform) : "tiktok";
  const [platform, setPlatform] = useState<PostPlatform>(initialPlatform);
  const [results, setResults] = useState<SavedResult[] | null>(null);
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  const [values, setValues] = useState<Record<keyof PostMetrics, string>>(() => Object.fromEntries(METRIC_KEYS.map((k) => [k, ""])) as Record<keyof PostMetrics, string>);
  const [source, setSource] = useState<"screenshot" | "manual">("manual");
  const [note, setNote] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    projectResultsAction(projectId).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setResults(res.data);
        const mine = res.data.find((r) => r.platform === initialPlatform);
        if (mine) loadResult(mine);
      } else toast.error(res.error);
    });
    return () => {
      alive = false;
    };
    // Loaded once per opening; the platform the dialog opens on comes from the post itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), [shots]);

  function fill(metrics: PostMetrics) {
    setValues(Object.fromEntries(METRIC_KEYS.map((k) => [k, toText(metrics[k])])) as Record<keyof PostMetrics, string>);
  }

  function loadResult(r: SavedResult) {
    setPlatform(r.platform as PostPlatform);
    fill(r.metrics);
    setDiagnosis(r.diagnosis);
  }

  function choosePlatform(p: PostPlatform) {
    setPlatform(p);
    const existing = results?.find((r) => r.platform === p);
    if (existing) loadResult(existing);
    else {
      fill(emptyMetrics());
      setDiagnosis(null);
    }
  }

  async function addShots(list: FileList | null) {
    if (!list?.length) return;
    const room = MAX_SHOTS - shots.length;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (list.length > room) toast.message(`${MAX_SHOTS} captures au maximum par lecture.`);
    const small = await Promise.all(picked.map(shrink));
    setShots((s) => [...s, ...small.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  async function read() {
    if (!shots.length) return;
    setReading(true);
    const form = new FormData();
    form.set("format", format);
    shots.forEach((s) => form.append("images", s.file));
    const res = await readResultScreenshotsAction(projectId, form);
    setReading(false);
    if (!res.ok) return toast.error(res.error);
    // Numbers the creator already typed and the reader missed are kept.
    setValues((current) => Object.fromEntries(METRIC_KEYS.map((k) => [k, res.data.metrics[k] != null ? toText(res.data.metrics[k]) : current[k]])) as Record<keyof PostMetrics, string>);
    if ((POST_PLATFORMS as readonly string[]).includes(res.data.platform) && res.data.platform !== platform) choosePlatformKeepValues(res.data.platform as PostPlatform);
    setSource("screenshot");
    setNote(res.data.unreadable);
    toast.success("Chiffres lus : vérifie-les puis enregistre.");
  }

  function choosePlatformKeepValues(p: PostPlatform) {
    setPlatform(p);
    setDiagnosis(null);
  }

  async function save() {
    const metrics = Object.fromEntries(METRIC_KEYS.map((k) => [k, toNumber(values[k])])) as PostMetrics;
    setSaving(true);
    const res = await saveResultAction({ projectId, platform, format, metrics, source });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    setDiagnosis(res.data.diagnosis);
    setResults((list) => [res.data, ...(list ?? []).filter((r) => r.platform !== res.data.platform)]);
    setShots([]);
    toast.success("Résultats enregistrés. Les leçons de ton compte se mettent à jour.");
  }

  async function remove(r: SavedResult) {
    const res = await deleteResultAction(r.id);
    if (!res.ok) return toast.error(res.error);
    setResults((list) => (list ?? []).filter((x) => x.id !== r.id));
    if (r.platform === platform) {
      fill(emptyMetrics());
      setDiagnosis(null);
    }
  }

  const fields = METRIC_KEYS.filter((k) => METRIC_LABELS[k].formats.includes(format));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-brand-300" /> Résultats de la publication</DialogTitle>
          <DialogDescription>
            <span className="line-clamp-1">« {title} »</span>
            Envoie les captures de ses statistiques 2 jours après la publication.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Plateforme</Label>
            <div className="flex flex-wrap gap-2">
              {POST_PLATFORMS.map((p) => {
                const has = results?.some((r) => r.platform === p);
                return (
                  <button key={p} type="button" onClick={() => choosePlatform(p)} aria-pressed={platform === p} className={cn("rounded-full border px-3 py-1.5 text-sm transition", platform === p ? "border-primary/60 bg-primary/15 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/25")}>
                    {POST_PLATFORM_LABELS[p]}{has ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <p className="text-sm font-semibold">1. Les captures d'écran</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {format === "carousel"
                ? "Les écrans de statistiques de la publication : vues, « Photos vues », j'aime, partages, enregistrements, nouveaux abonnés."
                : "Les écrans de statistiques de la vidéo : vues, durée de visionnage, courbe de rétention (« ont cessé de regarder à… »), nouveaux abonnés."}{" "}
              Les images servent seulement à lire les chiffres : elles ne sont pas conservées.
            </p>
            <div className="flex flex-wrap gap-2">
              {shots.map((s, i) => (
                <div key={s.url} className="relative h-24 w-14 overflow-hidden rounded-lg border border-white/10">
                  <img src={s.url} alt={`Capture ${i + 1}`} className="h-full w-full object-cover" />
                  <button type="button" aria-label="Retirer" onClick={() => setShots((list) => list.filter((x) => x !== s))} className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5"><X className="h-3 w-3" /></button>
                </div>
              ))}
              {shots.length < MAX_SHOTS && (
                <button type="button" onClick={() => inputRef.current?.click()} className="flex h-24 w-14 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-[10px] text-muted-foreground hover:border-white/30">
                  <ImagePlus className="h-4 w-4" /> Ajouter
                </button>
              )}
              <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addShots(e.target.files); e.target.value = ""; }} />
            </div>
            <Button type="button" variant="secondary" size="sm" className="w-full" disabled={!shots.length || reading} onClick={read}>
              {reading ? <><Loader2 className="animate-spin" /> Lecture des chiffres…</> : "Lire les chiffres"}
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">2. Vérifie les chiffres</p>
            {note && <p className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-2 text-[11px] text-amber-200">{note}</p>}
            <div className="grid grid-cols-2 gap-2">
              {fields.map((k) => (
                <div key={k} className="space-y-1">
                  <Label htmlFor={`m-${k}`} className="text-[11px] leading-tight">{METRIC_LABELS[k].label}{METRIC_LABELS[k].unit ? ` (${METRIC_LABELS[k].unit})` : ""}</Label>
                  <Input id={`m-${k}`} inputMode="decimal" value={values[k]} onChange={(e) => { setValues((v) => ({ ...v, [k]: e.target.value })); setSource((s) => (s === "screenshot" ? s : "manual")); }} className="h-8 text-sm" />
                </div>
              ))}
            </div>
            <Button type="button" variant="gradient" className="w-full" loading={saving} onClick={save}>Enregistrer les résultats</Button>
          </div>

          {diagnosis && (
            <div className="space-y-2 rounded-xl border border-brand-400/25 bg-brand-500/[0.07] p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-brand-300" /> Ce que dit cette publication</p>
              <p className="text-sm leading-relaxed">{diagnosis}</p>
              <Link href="/lessons" className="text-xs text-brand-200 underline-offset-4 hover:underline">Voir les leçons de ton compte →</Link>
            </div>
          )}

          {results && results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Résultats déjà enregistrés</p>
              {results.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-xs">
                  <button type="button" onClick={() => loadResult(r)} className="min-w-0 truncate text-left">
                    {POST_PLATFORM_LABELS[r.platform as PostPlatform] ?? r.platform} · {r.metrics.views != null ? `${r.metrics.views} vues` : "sans vues"}
                  </button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Supprimer ce résultat" className="text-red-300" onClick={() => remove(r)}><Trash2 /></Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The entry point on a posted project: opens its results. */
export function ResultsButton({ projectId, title, format, platforms, className }: { projectId: string; title: string; format: PostFormat; platforms: string[]; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" className={className} onClick={() => setOpen(true)}><BarChart3 /> Résultats</Button>
      {open && <ResultsDialog projectId={projectId} title={title} format={format} platforms={platforms} open={open} onOpenChange={setOpen} />}
    </>
  );
}
