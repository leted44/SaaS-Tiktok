"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, ListOrdered, PenLine, Pencil, Sparkles, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { scheduleAutopilotAction } from "@/server/actions/autopilot";
import { TONES, TONE_LABELS, templateCost, type Resolution, type Tone } from "@/lib/autopilot/template-shared";
import { TemplateFacts, type TemplateView } from "@/components/autopilot/templates-card";
import type { ScheduleSpace } from "@/components/autopilot/autopilot-board";
import { at, dateFmt, nextQuarterIn, seriesTimes, toLocalInput } from "@/components/autopilot/time";
import { cn } from "@/lib/utils";

interface Props {
  templates: TemplateView[];
  initialTemplateId: string | null;
  customVoiceName: string | null;
  quota: number;
  queued: number;
  leadHours: number;
  plan: { maxResolution: Resolution; free: boolean };
  credits: number;
  spaces: ScheduleSpace[];
  aiReady: boolean;
}

const NO_SPACE = "";
const MIN_BRIEF = 15;

const DURATIONS = [30, 45, 60, 90];
const INTERVALS: [number, string][] = [
  [6, "Toutes les 6 h"],
  [12, "Toutes les 12 h"],
  [24, "Chaque jour"],
  [48, "Tous les 2 jours"],
  [72, "Tous les 3 jours"],
  [168, "Chaque semaine"],
];
const MAX_SERIES = 30;
const MIN_LEAD_MS = 2 * 60_000;

export function ScheduleForm({ templates, initialTemplateId, customVoiceName, quota, queued, leadHours, plan, credits, spaces, aiReady }: Props) {
  const router = useRouter();
  const fallback = templates.find((t) => t.isDefault) ?? templates[0] ?? null;
  const [templateId, setTemplateId] = useState(templates.some((t) => t.id === initialTemplateId) ? initialTemplateId! : (fallback?.id ?? ""));
  const template = templates.find((t) => t.id === templateId) ?? fallback;
  const [mode, setMode] = useState<"single" | "series">("single");
  const [topic, setTopic] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [when, setWhen] = useState("");
  const [interval, setIntervalHours] = useState(24);
  const [duration, setDuration] = useState(template?.input.targetDurationSec ?? 45);
  const [tone, setTone] = useState<Tone>(template?.input.tone ?? "energetic");
  const [saving, setSaving] = useState(false);
  // Who writes the topics: the user, or the AI from the space's theme.
  const [source, setSource] = useState<"mine" | "ai">("mine");
  const [spaceId, setSpaceId] = useState(NO_SPACE);
  const [brief, setBrief] = useState("");
  // Raw text while typing (can be empty mid-edit); aiCount is the value actually used.
  const [aiCountText, setAiCountText] = useState("5");
  const aiCount = Math.max(1, Math.min(MAX_SERIES, Number(aiCountText) || 1));
  const ai = source === "ai";

  /** The theme follows the space picked, unless the user already wrote their own. */
  function pickSpace(id: string) {
    const previous = spaces.find((s) => s.id === spaceId)?.brief ?? "";
    const next = spaces.find((s) => s.id === id)?.brief ?? "";
    if (!brief.trim() || brief === previous) setBrief(next);
    setSpaceId(id);
  }

  // A template just saved in the editor comes back selected.
  const [seenInitial, setSeenInitial] = useState(initialTemplateId);
  if (initialTemplateId !== seenInitial) {
    setSeenInitial(initialTemplateId);
    if (initialTemplateId && templates.some((t) => t.id === initialTemplateId)) setTemplateId(initialTemplateId);
  }
  // Duration and tone start from the selected template's own, whenever the selection changes.
  const [syncedFor, setSyncedFor] = useState(template?.id ?? null);
  if ((template?.id ?? null) !== syncedFor) {
    setSyncedFor(template?.id ?? null);
    if (template) {
      setDuration(template.input.targetDurationSec);
      setTone(template.input.tone);
    }
  }

  // Set after mount: the default time depends on the viewer's clock and time zone.
  useEffect(() => setWhen(toLocalInput(nextQuarterIn(3600_000))), []);

  const topics = useMemo(
    () =>
      ai
        ? Array.from({ length: Math.min(Math.max(aiCount, 1), MAX_SERIES) }, () => "")
        : mode === "single"
          ? [topic.trim()].filter(Boolean)
          : topicsText.split("\n").map((l) => l.trim()).filter(Boolean),
    [ai, aiCount, mode, topic, topicsText],
  );
  const spaced = ai || mode === "series";
  const times = useMemo(() => (when ? seriesTimes(new Date(when), Math.max(1, topics.length), spaced ? interval : 24) : []), [when, topics.length, spaced, interval]);

  const perVideo = template ? templateCost({ targetDurationSec: duration, voiceSpeed: template.input.voiceSpeed, resolution: template.input.resolution }, plan.maxResolution) : 0;
  const total = perVideo * Math.max(1, topics.length);

  const problem = !template
    ? "Crée d'abord un modèle (étape 1)."
    : queued >= quota
      ? `Ta file est pleine (${quota} vidéos au maximum avec ton forfait).`
      : queued + topics.length > quota
        ? `Il reste ${quota - queued} place${quota - queued > 1 ? "s" : ""} dans ta file : retire des thèmes.`
        : topics.length > MAX_SERIES
          ? `${MAX_SERIES} vidéos au maximum à la fois.`
          : ai && !aiReady
            ? "La génération IA n'est pas configurée : écris les thèmes toi-même."
            : ai && brief.trim().length < MIN_BRIEF
              ? "Décris la thématique en une phrase au moins, pour que l'IA sache de quoi parler."
              : !ai && topics.some((t) => t.length < 3)
                ? "Chaque thème doit faire au moins 3 caractères."
                : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!template || !when || topics.length === 0 || problem) return;
    if (times[0].getTime() < Date.now() + MIN_LEAD_MS) return toast.error("Choisis une heure dans au moins 2 minutes.");
    setSaving(true);
    const res = await scheduleAutopilotAction({
      templateId: template.id,
      videos: topics.map((t, i) => ({ topic: t, deliverAt: times[i].toISOString() })),
      tone,
      targetDurationSec: duration,
      spaceId: spaceId || null,
      topicBrief: ai ? brief.trim() : null,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.data.ids.length > 1 ? `${res.data.ids.length} vidéos programmées, la première ${dateFmt.format(times[0])}.` : `Vidéo programmée pour ${dateFmt.format(times[0])}.`);
    setTopic("");
    setTopicsText("");
    router.push(`/autopilot?item=${res.data.ids[0]}`);
    router.refresh();
  }

  const quick: [string, () => Date][] = [
    ["Dans 15 min", () => nextQuarterIn(15 * 60_000)],
    ["Ce soir 18 h", () => (new Date().getHours() < 17 ? at(18, 0) : at(18, 1))],
    ["Demain 12 h", () => at(12, 1)],
  ];
  const count = topics.length;

  return (
    <form onSubmit={submit} className="surface space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-brand-200">2</span>
          Programmer
        </h2>
        <Badge variant={queued >= quota ? "warning" : "secondary"}>{queued} / {quota} en file</Badge>
      </div>

      {!template ? (
        <p className="rounded-lg border border-white/10 p-3 text-xs text-muted-foreground">Une fois ton modèle créé, tu programmes ici un thème — ou toute une série — et l'heure de livraison.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="ap-template">Modèle</Label>
              <Link href={`/autopilot/templates/${template.id}`} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /> Modifier</Link>
            </div>
            <select id="ap-template" value={template.id} onChange={(e) => setTemplateId(e.target.value)} className="h-9 w-full rounded-md border border-white/10 bg-transparent px-2 text-sm">
              {templates.map((t) => <option key={t.id} value={t.id} className="bg-background">{t.name}{t.isDefault ? " (par défaut)" : ""}</option>)}
            </select>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Chaque vidéo sera faite ainsi</p>
              <TemplateFacts input={{ ...template.input, targetDurationSec: duration, tone }} customVoiceName={customVoiceName} />
            </div>
          </div>

          {spaces.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="ap-space">Espace</Label>
              <select id="ap-space" value={spaceId} onChange={(e) => pickSpace(e.target.value)} className="h-9 w-full rounded-md border border-white/10 bg-transparent px-2 text-sm">
                <option value={NO_SPACE} className="bg-background">Aucun espace</option>
                {spaces.map((s) => <option key={s.id} value={s.id} className="bg-background">{s.name}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Sujets</Label>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 p-1">
              {([
                ["mine", PenLine, "Je les écris"],
                ["ai", Sparkles, "L'IA les choisit"],
              ] as const).map(([value, Icon, label]) => (
                <button key={value} type="button" aria-pressed={source === value} onClick={() => setSource(value)} className={cn("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition", source === value ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          {!ai && (
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 p-1">
              {([
                ["single", Video, "Une vidéo"],
                ["series", ListOrdered, "Une série"],
              ] as const).map(([value, Icon, label]) => (
                <button key={value} type="button" onClick={() => setMode(value)} className={cn("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition", mode === value ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          )}

          {ai ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ap-brief">Thématique</Label>
                <Textarea id="ap-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} maxLength={600} placeholder="Ex. : pensées positives et petites habitudes pour bien commencer la journée" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Chaque sujet est inventé au démarrage de sa production, d'après cette thématique, sans reprendre ceux des vidéos déjà faites{spaceId ? " dans cet espace" : ""}. Aucun crédit en plus.
                  {spaceId && !spaces.find((s) => s.id === spaceId)?.brief && " Elle sera enregistrée comme thématique de l'espace."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-count">Nombre de vidéos</Label>
                <Input
                  id="ap-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_SERIES}
                  value={aiCountText}
                  onChange={(e) => setAiCountText(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                  onBlur={() => setAiCountText(String(aiCount))}
                />
              </div>
            </div>
          ) : mode === "single" ? (
            <div className="space-y-1.5">
              <Label htmlFor="ap-topic">Thème</Label>
              <Textarea id="ap-topic" value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} maxLength={1200} placeholder="Ex. : 3 erreurs qui ruinent ton sommeil, et quoi faire à la place" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="ap-topics">Thèmes — un par ligne</Label>
                <span className={cn("text-[11px]", count > MAX_SERIES ? "text-amber-300" : "text-muted-foreground")}>{count} vidéo{count > 1 ? "s" : ""}</span>
              </div>
              <Textarea id="ap-topics" value={topicsText} onChange={(e) => setTopicsText(e.target.value)} rows={6} placeholder={"Pourquoi on procrastine le dimanche soir\n3 habitudes pour se lever plus tôt\nLe mythe des 8 heures de sommeil"} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ap-when">{spaced && count > 1 ? "Première livraison" : "Livraison"}</Label>
            <Input id="ap-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
            <div className="flex flex-wrap gap-1.5">
              {quick.map(([label, pick]) => (
                <button key={label} type="button" onClick={() => setWhen(toLocalInput(pick()))} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-white/25 hover:text-foreground">
                  {label}
                </button>
              ))}
            </div>
          </div>

          {spaced && (ai ? count > 1 : true) && (
            <div className="space-y-1.5">
              <Label htmlFor="ap-interval">Puis une vidéo</Label>
              <select id="ap-interval" value={interval} onChange={(e) => setIntervalHours(Number(e.target.value))} className="h-9 w-full rounded-md border border-white/10 bg-transparent px-2 text-sm">
                {INTERVALS.map(([h, label]) => <option key={h} value={h} className="bg-background">{label}</option>)}
              </select>
              {count > 0 && when && (
                <ol className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] p-2 text-[11px]">
                  {topics.slice(0, MAX_SERIES).map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-[108px] shrink-0 text-muted-foreground">{dateFmt.format(times[i])}</span>
                      <span className={cn("min-w-0 truncate", !t && "text-muted-foreground")}>{t || "Sujet choisi par l'IA"}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Durée</Label>
              <div className="grid grid-cols-4 gap-1">
                {DURATIONS.map((d) => (
                  <button key={d} type="button" onClick={() => setDuration(d)} className={cn("rounded-md border py-1.5 text-[11px] transition", duration === d ? "border-primary/60 bg-primary/10 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20")}>
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-tone">Ton</Label>
              <select id="ap-tone" value={tone} onChange={(e) => setTone(e.target.value as Tone)} className="h-[30px] w-full rounded-md border border-white/10 bg-transparent px-2 text-xs">
                {TONES.map((value) => <option key={value} value={value} className="bg-background">{TONE_LABELS[value]}</option>)}
              </select>
            </div>
          </div>

          {problem && (count > 0 || queued >= quota) && <p className="flex gap-1.5 text-[11px] text-amber-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {problem}</p>}
          {!plan.free && total > credits && count > 0 && (
            <p className="flex gap-1.5 text-[11px] text-amber-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Il faut environ {total} crédits pour {count > 1 ? "ces vidéos" : "cette vidéo"} et ton solde est de {credits} : recharge avant la production, sinon elle échouera.</p>
          )}

          <Button type="submit" variant="gradient" className="w-full" loading={saving} disabled={Boolean(problem) || count === 0 || !when}>
            <CalendarClock /> {count > 1 ? `Programmer ${count} vidéos` : "Programmer la vidéo"}
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            La production démarre {leadHours} h avant l'heure de livraison (tout de suite si elle est plus proche) : tu peux relire et retoucher la vidéo dans le studio avant qu'elle parte.
            {!plan.free && <> Environ {perVideo} crédits par vidéo, débités étape par étape — solde : {credits}.</>}
          </p>
        </>
      )}
    </form>
  );
}
