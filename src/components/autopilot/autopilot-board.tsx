"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, BellRing, CalendarClock, CheckCircle2, ChevronDown, Copy, Download, ExternalLink, FileText, Film, Layers, Loader2, MessageCircle, Mic2, RotateCcw, Send, Share2, Sparkles, Trash2, Wand2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UpgradePrompt } from "@/components/shared/upgrade-prompt";
import { cancelAutopilotAction, deleteAutopilotAction, retryAutopilotAction } from "@/server/actions/autopilot";
import { TONES, type AppliedTemplate, type Resolution, type TemplateInput, type Tone } from "@/lib/autopilot/template-shared";
import { TemplatesCard, TemplateFacts, type TemplateView } from "@/components/autopilot/templates-card";
import { ScheduleForm } from "@/components/autopilot/schedule-form";
import { NotificationsCard } from "@/components/autopilot/notifications-card";
import { dateFmt, relative, timeFmt, useNow } from "@/components/autopilot/time";
import { cn, slugify } from "@/lib/utils";

export type { TemplateView };

type Status = "SCHEDULED" | "SCRIPTING" | "VOICING" | "VISUALS" | "RENDERING" | "READY" | "DELIVERED" | "FAILED" | "CANCELLED";

export interface AutopilotItemView {
  id: string;
  topic: string;
  tone: string;
  targetDurationSec: number;
  deliverAt: string;
  status: Status;
  failedStep: Status | null;
  error: string | null;
  attempts: number;
  /** When the next automatic attempt of a failed step is due. */
  retryAt: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  projectId: string | null;
  title: string | null;
  /** TikTok description + hashtags, ready to paste. */
  caption: string | null;
  templateId: string | null;
  templateName: string | null;
  /** The settings frozen when production started; null before that. */
  applied: AppliedTemplate | null;
  /** The AI picks (or picked) the topic, from a theme. */
  aiTopic: boolean;
  space: { name: string; color: string } | null;
}

export interface ScheduleSpace {
  id: string;
  name: string;
  color: string;
  brief: string | null;
}

interface Props {
  templates: TemplateView[];
  items: AutopilotItemView[];
  highlightItem: string | null;
  highlightTemplate: string | null;
  quota: number;
  queued: number;
  leadHours: number;
  maxAttempts: number;
  plan: { maxResolution: Resolution; free: boolean };
  credits: number;
  admin: boolean;
  /** Last run of the background worker that moves every video forward. */
  heartbeat: { tickAt: string; error: string | null } | null;
  customVoiceName: string | null;
  recentProjects: { id: string; title: string }[];
  pushKey: string | null;
  ready: { ai: boolean; tts: boolean; stock: boolean };
  spaces: ScheduleSpace[];
}

const STEPS: { key: Status; label: string; icon: typeof FileText }[] = [
  { key: "SCRIPTING", label: "Script", icon: FileText },
  { key: "VOICING", label: "Voix", icon: Mic2 },
  { key: "VISUALS", label: "Visuels", icon: Layers },
  { key: "RENDERING", label: "Rendu", icon: Film },
  { key: "READY", label: "Prête", icon: CheckCircle2 },
  { key: "DELIVERED", label: "Livrée", icon: Send },
];
const IN_PRODUCTION: Status[] = ["SCRIPTING", "VOICING", "VISUALS", "RENDERING"];
const ACTIVE: Status[] = ["SCHEDULED", ...IN_PRODUCTION, "READY"];
/** The worker runs every minute; past this, it has stopped. */
const STALE_AFTER_MS = 3 * 60_000;

function isTone(value: string): value is Tone {
  return (TONES as readonly string[]).includes(value);
}

function stepIndex(item: AutopilotItemView): number {
  const key = item.status === "FAILED" ? item.failedStep : item.status;
  return STEPS.findIndex((s) => s.key === key);
}

export function AutopilotBoard(props: Props) {
  const { templates, items, highlightItem, highlightTemplate, quota, queued, leadHours, plan, credits, heartbeat, customVoiceName, recentProjects, pushKey, spaces } = props;
  const router = useRouter();
  const now = useNow();

  // Follow the worker, which advances items once a minute: closely while something is moving,
  // and every minute otherwise so the engine status never goes stale on an open page.
  const moving = items.some((i) => IN_PRODUCTION.includes(i.status) || (now !== null && ((i.status === "SCHEDULED" && new Date(i.deliverAt).getTime() - leadHours * 3600_000 <= now) || (i.status === "READY" && new Date(i.deliverAt).getTime() <= now))));
  useEffect(() => {
    const t = setInterval(() => router.refresh(), moving ? 15_000 : 60_000);
    return () => clearInterval(t);
  }, [moving, router]);

  const failed = items.filter((i) => i.status === "FAILED").reverse();
  const active = items.filter((i) => ACTIVE.includes(i.status));
  const history = items.filter((i) => i.status === "DELIVERED" || i.status === "CANCELLED").reverse();
  const defaultTemplate = templates.find((t) => t.isDefault) ?? templates[0] ?? null;

  /** What an item is (or will be) made with: its frozen settings once started, else its template's current ones. */
  function settingsOf(item: AutopilotItemView): { input: TemplateInput; label: string } | null {
    if (item.applied) return { input: item.applied, label: item.templateName ? `Modèle « ${item.templateName} », réglages figés au démarrage` : "Réglages figés au démarrage (modèle supprimé depuis)" };
    const t = templates.find((x) => x.id === item.templateId) ?? defaultTemplate;
    return t ? { input: t.input, label: `Modèle « ${t.name} »${t.id !== item.templateId ? " (par défaut)" : ""}` } : null;
  }

  if (quota === 0) {
    return (
      <div className="space-y-6">
        <UpgradePrompt title="Le pilote automatique est inclus dans les forfaits Pro et Agence" body="Programme tes thèmes à l'avance : chaque vidéo est écrite, montée et livrée à l'heure choisie, sans que tu aies à ouvrir le studio." />
        <HowItWorks leadHours={leadHours} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EngineStatus heartbeat={heartbeat} now={now} admin={props.admin} ready={props.ready} hasWork={active.length > 0} />

      {failed.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-red-300">
            <AlertTriangle className="h-4 w-4" /> À corriger <span className="text-foreground">{failed.length}</span>
          </h2>
          <div className="space-y-3">
            {failed.map((item) => <ItemCard key={item.id} item={item} settings={settingsOf(item)} customVoiceName={customVoiceName} now={now} leadHours={leadHours} maxAttempts={props.maxAttempts} highlighted={item.id === highlightItem} />)}
          </div>
        </section>
      )}

      {templates.length === 0 && <HowItWorks leadHours={leadHours} />}

      <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-4">
          <TemplatesCard templates={templates} highlight={highlightTemplate} customVoiceName={customVoiceName} recentProjects={recentProjects} plan={plan} queueFull={queued >= quota} />
          <ScheduleForm templates={templates} initialTemplateId={highlightTemplate} customVoiceName={customVoiceName} quota={quota} queued={queued} leadHours={leadHours} plan={plan} credits={credits} spaces={spaces} aiReady={props.ready.ai} />
          <NotificationsCard pushKey={pushKey} />
        </div>

        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> À venir <span className="text-foreground">{active.length}</span>
            </h2>
            {active.length === 0 ? (
              <div className="surface p-6 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-brand-300" />
                <p className="mt-2 text-sm font-medium">Aucune vidéo programmée</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                  {templates.length === 0 ? "Crée ton modèle (étape 1), puis programme un thème et une heure (étape 2)." : "Programme un thème et une heure (étape 2), ou lance un test depuis ton modèle : la vidéo complète arrive en quelques minutes."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {active.map((item) => <ItemCard key={item.id} item={item} settings={settingsOf(item)} customVoiceName={customVoiceName} now={now} leadHours={leadHours} maxAttempts={props.maxAttempts} highlighted={item.id === highlightItem} />)}
              </div>
            )}
          </section>

          {history.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historique</h2>
              <div className="space-y-3">
                {history.map((item) => <ItemCard key={item.id} item={item} settings={settingsOf(item)} customVoiceName={customVoiceName} now={now} leadHours={leadHours} maxAttempts={props.maxAttempts} highlighted={item.id === highlightItem} />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Whether the background worker is running. Nothing moves without it, so a
 * stopped worker is said plainly instead of leaving videos silently waiting.
 */
function EngineStatus({ heartbeat, now, admin, ready, hasWork }: { heartbeat: Props["heartbeat"]; now: number | null; admin: boolean; ready: Props["ready"]; hasWork: boolean }) {
  if (now === null) return <div className="h-[42px] rounded-xl border border-white/[0.06]" />;
  const age = heartbeat ? now - new Date(heartbeat.tickAt).getTime() : Infinity;
  const running = age <= STALE_AFTER_MS;
  const missing = [!ready.ai && "scripts IA (clé Anthropic)", !ready.tts && "voix off (clé ElevenLabs — sinon piste muette)", !ready.stock && "visuels (clé Pexels — sinon fond animé)"].filter(Boolean) as string[];

  return (
    <div className="space-y-2">
      {running ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-xs">
          <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
          <span className="min-w-0"><span className="font-medium text-emerald-300">Production automatique active</span><span className="text-muted-foreground"> · dernier passage {relative(heartbeat!.tickAt, now)}</span></span>
        </div>
      ) : (
        <div className={cn("flex gap-2.5 rounded-xl border px-3 py-2.5 text-xs", hasWork ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200")}>
          <Activity className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">{heartbeat ? `Production automatique à l'arrêt depuis ${relative(heartbeat.tickAt, now).replace(/^il y a /, "")}` : "La production automatique n'a encore jamais tourné"}</p>
            <p className="opacity-80">
              {admin
                ? "La tâche planifiée qui appelle /api/jobs/process chaque minute (cron-job.org) ne passe plus : vérifie qu'elle est active et que son URL contient le bon secret. Tant qu'elle est arrêtée, aucune vidéo n'avance."
                : "Tes vidéos programmées reprendront automatiquement dès son redémarrage."}
            </p>
          </div>
        </div>
      )}
      {admin && heartbeat?.error && running && (
        <p className="flex gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Dernier passage en erreur : {heartbeat.error}</p>
      )}
      {admin && missing.length > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">Services non configurés — ces étapes tournent en mode dégradé : {missing.join(", ")}.</p>
      )}
    </div>
  );
}

function HowItWorks({ leadHours }: { leadHours: number }) {
  const steps = [
    { icon: Wand2, title: "Tu règles ton modèle", body: "Voix, sous-titres, musique, visuels, format — avec l'aperçu du résultat." },
    { icon: CalendarClock, title: "Tu programmes", body: "Un thème ou toute une série, et l'heure de livraison." },
    { icon: Sparkles, title: "L'IA produit", body: `Dès ${leadHours} h avant : script, voix, visuels et montage, selon ton modèle.` },
    { icon: BellRing, title: "Tu reçois ta vidéo", body: "Une notification à l'heure dite, la vidéo prête à publier." },
  ];
  return (
    <ol className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15"><s.icon className="h-4 w-4 text-brand-300" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{i + 1}. {s.title}</p>
            <p className="text-xs text-muted-foreground">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function statusBadge(item: AutopilotItemView) {
  switch (item.status) {
    case "SCHEDULED":
      return <Badge variant="secondary">Programmée</Badge>;
    case "READY":
      return <Badge variant="success">Prête</Badge>;
    case "DELIVERED":
      return <Badge variant="gradient">Livrée</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Échec</Badge>;
    case "CANCELLED":
      return <Badge variant="secondary">Annulée</Badge>;
    default:
      return <Badge variant="info" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {STEPS.find((s) => s.key === item.status)?.label}</Badge>;
  }
}

const VIDEO_BOX: Record<TemplateInput["aspectRatio"], string> = {
  VERTICAL: "aspect-[9/16] max-w-[180px]",
  SQUARE: "aspect-square max-w-[240px]",
  HORIZONTAL: "aspect-video max-w-[320px]",
};

function ItemCard({ item, settings, customVoiceName, now, leadHours, maxAttempts, highlighted }: { item: AutopilotItemView; settings: { input: TemplateInput; label: string } | null; customVoiceName: string | null; now: number | null; leadHours: number; maxAttempts: number; highlighted: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "cancel" | "retry" | "delete" | "share" | "download">(null);
  const [showSettings, setShowSettings] = useState(false);
  const current = stepIndex(item);
  const deliverAt = new Date(item.deliverAt);
  const startsAt = new Date(deliverAt.getTime() - leadHours * 3600_000);
  const name = item.title ?? (item.topic || "Sujet choisi par l'IA au démarrage de la production");
  const fileName = `${slugify(name).slice(0, 40).replace(/-+$/, "") || "video"}.mp4`;
  const shareText = useMemo(() => [name, item.caption].filter(Boolean).join("\n\n"), [name, item.caption]);
  const failedStep = item.failedStep ? STEPS.find((s) => s.key === item.failedStep)?.label : null;

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  async function run(kind: "cancel" | "retry" | "delete") {
    if (kind === "cancel" && !window.confirm("Annuler cette vidéo ? Les étapes déjà faites restent facturées.")) return;
    if (kind === "delete" && !window.confirm("Retirer cette vidéo de la liste ? Le projet reste dans Projets.")) return;
    setBusy(kind);
    const action = kind === "cancel" ? cancelAutopilotAction : kind === "retry" ? retryAutopilotAction : deleteAutopilotAction;
    const res = await action(item.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    if (kind === "retry") toast.success("Relancée : elle reprend à l'étape où elle s'était arrêtée.");
    router.refresh();
  }

  async function videoFile(): Promise<File> {
    const res = await fetch(item.videoUrl!);
    if (!res.ok) throw new Error("Vidéo introuvable.");
    return new File([await res.blob()], fileName, { type: "video/mp4" });
  }

  /** The video itself when the phone can share files (WhatsApp keeps the text as its caption), else the link. */
  async function share() {
    if (!item.videoUrl) return;
    setBusy("share");
    try {
      if (typeof navigator.share === "function") {
        try {
          const file = await videoFile();
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text: shareText });
            return;
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
        await navigator.share({ title: name, text: shareText, url: item.videoUrl });
        return;
      }
      window.open(whatsappLink(), "_blank", "noopener");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : "Partage impossible.");
    } finally {
      setBusy(null);
    }
  }

  function whatsappLink() {
    return `https://wa.me/?text=${encodeURIComponent(`${shareText}\n\n${item.videoUrl}`)}`;
  }

  async function download() {
    if (!item.videoUrl) return;
    setBusy("download");
    try {
      const file = await videoFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      window.open(item.videoUrl, "_blank", "noopener");
    } finally {
      setBusy(null);
    }
  }

  async function copyCaption() {
    if (!item.caption) return;
    await navigator.clipboard.writeText(item.caption);
    toast.success("Description copiée.");
  }

  const terminal = !ACTIVE.includes(item.status);
  const showVideo = Boolean(item.videoUrl) && (item.status === "READY" || item.status === "DELIVERED");
  const aspect = settings?.input.aspectRatio ?? "VERTICAL";

  return (
    <div ref={ref} className={cn("surface overflow-hidden transition", highlighted && "ring-2 ring-primary/60", item.status === "FAILED" && "border-red-500/30")}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {showVideo && (
          <video src={item.videoUrl!} poster={item.thumbnailUrl ?? undefined} controls playsInline preload="metadata" className={cn("w-full shrink-0 self-center rounded-lg bg-black sm:self-start", VIDEO_BOX[aspect])} />
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium">{name}</p>
              {item.title && item.title !== item.topic && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{item.aiTopic ? "Sujet choisi par l'IA" : "Thème"} : {item.topic}</p>}
              {(item.space || (item.aiTopic && !item.title)) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  {item.space && <span className="inline-flex items-center gap-1 font-medium text-foreground/80"><span className="h-1.5 w-1.5 rounded-full" style={{ background: item.space.color }} />{item.space.name}</span>}
                  {item.aiTopic && !item.title && <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" />{item.topic ? `Sujet choisi : ${item.topic}` : "d'après la thématique, sans répéter les vidéos déjà faites"}</span>}
                </p>
              )}
            </div>
            {statusBadge(item)}
          </div>

          <p className="text-xs text-muted-foreground">
            {now === null ? " " : (
              <>
                <CalendarClock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                {item.status === "DELIVERED" ? "Livrée" : "Livraison"} {dateFmt.format(deliverAt)} · {relative(item.deliverAt, now)}
                {item.status === "SCHEDULED" && (startsAt.getTime() > now ? ` · production à ${timeFmt.format(startsAt)}` : " · démarrage imminent")}
                {` · ${item.targetDurationSec}s`}
              </>
            )}
          </p>

          {item.status !== "CANCELLED" && (
            <div className="grid grid-cols-6 gap-1">
              {STEPS.map((s, i) => {
                const failedHere = item.status === "FAILED" && i === current;
                const done = item.status === "DELIVERED" || (current >= 0 && i < current) || (item.status === "READY" && i === current);
                const doing = !failedHere && i === current && IN_PRODUCTION.includes(item.status);
                return (
                  <div key={s.key} className="space-y-1">
                    <div className={cn("h-1 rounded-full", failedHere ? "bg-red-400" : done ? "bg-brand-gradient" : doing ? "animate-pulse bg-sky-400/70" : "bg-white/10")} />
                    <p className={cn("flex items-center gap-1 truncate text-[10px]", failedHere ? "text-red-300" : done || doing ? "text-foreground" : "text-muted-foreground")}>
                      <s.icon className="h-3 w-3 shrink-0" /> <span className="truncate">{s.label}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {item.error && item.status === "FAILED" && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-[11px] text-red-200">
              <p className="flex gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Arrêtée à l'étape {failedStep ?? "inconnue"}{item.attempts > 1 ? ` après ${item.attempts} essais` : ""}</p>
              <p className="mt-1 whitespace-pre-wrap break-words pl-5 opacity-90">{item.error}</p>
              <p className="mt-1.5 pl-5 text-red-200/70">« Relancer » reprend à cette étape, sans refaire ni refacturer les précédentes.</p>
            </div>
          )}
          {item.error && item.status !== "FAILED" && item.attempts > 0 && (
            <p className="text-[11px] text-amber-300">
              Nouvel essai automatique {item.retryAt && now !== null ? relative(item.retryAt, now) : "dans quelques minutes"} (essai {item.attempts + 1}/{maxAttempts}) — {item.error}
            </p>
          )}

          {showVideo && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="gradient" size="sm" loading={busy === "share"} disabled={busy !== null} onClick={share}><Share2 /> Partager</Button>
              <Button asChild variant="secondary" size="sm"><a href={whatsappLink()} target="_blank" rel="noopener noreferrer"><MessageCircle /> WhatsApp</a></Button>
              <Button variant="ghost" size="sm" loading={busy === "download"} disabled={busy !== null} onClick={download}><Download /> Télécharger</Button>
            </div>
          )}
          {showVideo && item.status === "READY" && (
            <p className="text-[11px] text-muted-foreground">Prête en avance : relis-la et ajuste-la dans le studio si besoin — c'est la dernière version rendue qui sera livrée.</p>
          )}

          {settings && (
            <div>
              <button type="button" onClick={() => setShowSettings((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                <Wand2 className="h-3 w-3" /> {settings.label}
                <ChevronDown className={cn("h-3 w-3 transition", showSettings && "rotate-180")} />
              </button>
              {showSettings && <TemplateFacts input={{ ...settings.input, targetDurationSec: item.targetDurationSec, tone: isTone(item.tone) ? item.tone : settings.input.tone }} customVoiceName={customVoiceName} className="mt-2 rounded-lg border border-white/[0.06] p-2.5" />}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {item.status === "FAILED" && <Button variant="secondary" size="sm" className="h-7 px-2 text-[11px]" loading={busy === "retry"} disabled={busy !== null} onClick={() => run("retry")}><RotateCcw /> Relancer</Button>}
            {item.caption && showVideo && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={copyCaption}><Copy /> Copier la description</Button>}
            {item.projectId && <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px]"><Link href={`/studio/${item.projectId}`}><ExternalLink /> Ouvrir dans le studio</Link></Button>}
            {!terminal && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-red-300" loading={busy === "cancel"} disabled={busy !== null} onClick={() => run("cancel")}><X /> Annuler</Button>}
            {terminal && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground" loading={busy === "delete"} disabled={busy !== null} onClick={() => run("delete")}><Trash2 /> Retirer</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
