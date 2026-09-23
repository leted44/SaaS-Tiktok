"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Bell, BellOff, BellRing, CalendarClock, CheckCircle2, Copy, Download, ExternalLink, FileText, Film, Layers, Loader2, MessageCircle, Mic2, RotateCcw, Send, Share2, Sparkles, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UpgradePrompt } from "@/components/shared/upgrade-prompt";
import {
  cancelAutopilotAction, deleteAutopilotAction, removePushSubscriptionAction, retryAutopilotAction, savePushSubscriptionAction, scheduleAutopilotAction, sendTestPushAction,
} from "@/server/actions/autopilot";
import { cn, slugify } from "@/lib/utils";

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
  videoUrl: string | null;
  thumbnailUrl: string | null;
  projectId: string | null;
  title: string | null;
  /** TikTok description + hashtags, ready to paste. */
  caption: string | null;
}

interface Props {
  items: AutopilotItemView[];
  highlight: string | null;
  quota: number;
  queued: number;
  leadHours: number;
  /** Null when the account is not billed (admin). */
  costs: { script: number; render: number; voicePer30s: number } | null;
  credits: number;
  pushKey: string | null;
  ready: { ai: boolean; tts: boolean; stock: boolean };
  defaults: { language: string };
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

const TONES: [string, string][] = [
  ["energetic", "Énergique"],
  ["educational", "Pédagogique"],
  ["storytelling", "Narratif"],
  ["controversial", "Provocateur"],
  ["calm", "Posé"],
  ["humorous", "Humour"],
];
const DURATIONS = [30, 45, 60];

/** "YYYY-MM-DDTHH:mm" in the browser's own time zone, as datetime-local expects. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function nextQuarterIn(ms: number): Date {
  const d = new Date(Date.now() + ms);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  return d;
}

function at(hour: number, dayOffset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

function relative(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return diff >= 0 ? "dans moins d'une minute" : "à l'instant";
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 48 * 3600_000) return rtf.format(Math.round(diff / 3600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

function stepIndex(item: AutopilotItemView): number {
  const key = item.status === "FAILED" ? item.failedStep : item.status;
  return STEPS.findIndex((s) => s.key === key);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Dates are shown in the viewer's own time zone, so they are only rendered once in the browser. */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function AutopilotBoard({ items, highlight, quota, queued, leadHours, costs, credits, pushKey, ready, defaults }: Props) {
  const router = useRouter();
  const now = useNow();

  // While something is moving, follow it: the worker advances items once a minute.
  const moving = items.some((i) => IN_PRODUCTION.includes(i.status) || (now !== null && ((i.status === "SCHEDULED" && new Date(i.deliverAt).getTime() - leadHours * 3600_000 <= now) || (i.status === "READY" && new Date(i.deliverAt).getTime() <= now))));
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [moving, router]);

  const active = items.filter((i) => ACTIVE.includes(i.status));
  const history = items.filter((i) => !ACTIVE.includes(i.status)).reverse();

  if (quota === 0) {
    return (
      <div className="space-y-6">
        <UpgradePrompt title="Le pilote automatique est inclus dans les forfaits Pro et Agence" body="Programme tes thèmes à l'avance : chaque vidéo est écrite, montée et livrée à l'heure choisie, sans que tu aies à ouvrir le studio." />
        <HowItWorks leadHours={leadHours} />
      </div>
    );
  }

  const missing = [!ready.ai && "scripts IA (clé Anthropic)", !ready.tts && "voix off (clé ElevenLabs — sinon piste muette)", !ready.stock && "visuels (clé Pexels — sinon fond animé)"].filter(Boolean) as string[];

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <ScheduleForm quota={quota} queued={queued} costs={costs} credits={credits} leadHours={leadHours} language={defaults.language} />
        <NotificationsCard pushKey={pushKey} />
        {missing.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
            <p className="font-medium">Services non configurés</p>
            <p className="mt-0.5 text-amber-200/80">Sans eux, ces étapes tournent en mode dégradé : {missing.join(", ")}.</p>
          </div>
        )}
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
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Donne un thème et une heure : la vidéo sera prête et livrée à ce moment-là. Pour un premier essai, choisis « Dans 15 min ».</p>
            </div>
          ) : (
            <div className="space-y-3">
              {active.map((item) => <ItemCard key={item.id} item={item} now={now} leadHours={leadHours} highlighted={item.id === highlight} />)}
            </div>
          )}
        </section>

        {history.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historique</h2>
            <div className="space-y-3">
              {history.map((item) => <ItemCard key={item.id} item={item} now={now} leadHours={leadHours} highlighted={item.id === highlight} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function HowItWorks({ leadHours }: { leadHours: number }) {
  const steps = [
    { icon: CalendarClock, title: "Tu programmes", body: "Un thème, une date, une heure. Autant de vidéos que ton forfait le permet." },
    { icon: Sparkles, title: "L'IA produit", body: `${leadHours} h avant l'heure prévue : script, voix, visuels et montage, avec ta charte de marque.` },
    { icon: BellRing, title: "Tu reçois ta vidéo", body: "À l'heure dite, une notification te livre la vidéo et sa description, prêtes à publier." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {steps.map((s) => (
        <div key={s.title} className="surface p-4">
          <s.icon className="h-5 w-5 text-brand-300" />
          <p className="mt-2 text-sm font-semibold">{s.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
        </div>
      ))}
    </div>
  );
}

function ScheduleForm({ quota, queued, costs, credits, leadHours, language }: { quota: number; queued: number; costs: Props["costs"]; credits: number; leadHours: number; language: string }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState(45);
  const [tone, setTone] = useState("energetic");
  const [saving, setSaving] = useState(false);

  // Set after mount: the default time depends on the viewer's clock and time zone.
  useEffect(() => setWhen(toLocalInput(nextQuarterIn(3600_000))), []);

  const estimate = costs ? costs.script + Math.max(costs.voicePer30s, Math.ceil(duration / 30) * costs.voicePer30s) + costs.render : 0;
  const full = queued >= quota;

  const quick: [string, () => Date][] = [
    ["Dans 15 min", () => nextQuarterIn(15 * 60_000)],
    ["Ce soir 18 h", () => (new Date().getHours() < 17 ? at(18, 0) : at(18, 1))],
    ["Demain 12 h", () => at(12, 1)],
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!when) return;
    setSaving(true);
    const res = await scheduleAutopilotAction({ topic, deliverAt: new Date(when).toISOString(), tone, targetDurationSec: duration });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Vidéo programmée pour ${dateFmt.format(new Date(when))}.`);
    setTopic("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="surface space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Programmer une vidéo</p>
        <Badge variant={full ? "warning" : "secondary"}>{queued} / {quota} en file</Badge>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ap-topic">Thème</Label>
        <Textarea id="ap-topic" value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} maxLength={1200} placeholder="Ex. : 3 erreurs qui ruinent ton sommeil, et quoi faire à la place" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ap-when">Livraison</Label>
        <Input id="ap-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
        <div className="flex flex-wrap gap-1.5">
          {quick.map(([label, pick]) => (
            <button key={label} type="button" onClick={() => setWhen(toLocalInput(pick()))} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-white/25 hover:text-foreground">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Durée</Label>
          <div className="grid grid-cols-3 gap-1">
            {DURATIONS.map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className={cn("rounded-md border py-1.5 text-xs transition", duration === d ? "border-primary/60 bg-primary/10 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20")}>
                {d}s
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ap-tone">Ton</Label>
          <select id="ap-tone" value={tone} onChange={(e) => setTone(e.target.value)} className="h-[34px] w-full rounded-md border border-white/10 bg-transparent px-2 text-xs">
            {TONES.map(([value, label]) => <option key={value} value={value} className="bg-background">{label}</option>)}
          </select>
        </div>
      </div>

      <Button type="submit" variant="gradient" className="w-full" loading={saving} disabled={full || topic.trim().length < 3 || !when}>
        <CalendarClock /> Programmer
      </Button>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        La production démarre {leadHours} h avant l'heure choisie (tout de suite si c'est plus proche), avec la voix, la musique et le format de ta{" "}
        <Link href="/brand" className="underline underline-offset-2">charte de marque</Link>. Langue : {language.toUpperCase()}.
        {costs && <> Environ {estimate} crédits par vidéo, débités étape par étape — solde : {credits}.</>}
      </p>
    </form>
  );
}

type PushState = "checking" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

function NotificationsCard({ pushKey }: { pushKey: string | null }) {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushKey) return setState("unconfigured");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      if (sub) {
        // Re-register it with the server: cheap, and repairs a subscription the server lost or another account took.
        void savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
        setState("on");
      } else setState("off");
    })().catch(() => !cancelled && setState("off"));
    return () => {
      cancelled = true;
    };
  }, [pushKey]);

  async function enable() {
    if (!pushKey) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const key = urlBase64ToUint8Array(pushKey);
      let sub = await reg.pushManager.getSubscription();
      // A subscription made with another key (after a server key change) must be replaced.
      if (sub && sub.options.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))) !== btoa(String.fromCharCode(...key))) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
      if (!res.ok) return toast.error(res.error);
      setState("on");
      toast.success("Notifications activées sur cet appareil.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'activer les notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const res = await sendTestPushAction();
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Notification envoyée — elle arrive dans quelques secondes.");
  }

  const text: Record<PushState, string> = {
    checking: "Vérification…",
    unsupported: "Ce navigateur ne gère pas les notifications. Sur iPhone, ajoute d'abord l'app à l'écran d'accueil.",
    unconfigured: "Les notifications ne sont pas configurées sur le serveur (AUTH_SECRET manquant).",
    denied: "Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur, puis recharge la page.",
    off: "Reçois une notification à l'heure prévue, avec ta vidéo prête à partager (WhatsApp, TikTok…).",
    on: "Activées sur cet appareil. Tu seras prévenu à l'heure de chaque livraison, et en cas d'échec.",
  };

  return (
    <div className="surface space-y-3 p-4">
      <div className="flex items-center gap-2">
        {state === "on" ? <BellRing className="h-4 w-4 text-emerald-400" /> : state === "denied" || state === "unsupported" ? <BellOff className="h-4 w-4 text-muted-foreground" /> : <Bell className="h-4 w-4 text-brand-300" />}
        <p className="font-semibold">Notifications</p>
      </div>
      <p className="text-xs text-muted-foreground">{text[state]}</p>
      {state === "off" && <Button variant="secondary" size="sm" className="w-full" loading={busy} onClick={enable}><Bell /> Activer sur ce téléphone</Button>}
      {state === "on" && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" loading={busy} onClick={test}><Send /> Tester</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={disable}><BellOff /> Désactiver</Button>
        </div>
      )}
    </div>
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

function ItemCard({ item, now, leadHours, highlighted }: { item: AutopilotItemView; now: number | null; leadHours: number; highlighted: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "cancel" | "retry" | "delete" | "share" | "download">(null);
  const current = stepIndex(item);
  const deliverAt = new Date(item.deliverAt);
  const startsAt = new Date(deliverAt.getTime() - leadHours * 3600_000);
  const name = item.title ?? item.topic;
  const fileName = `${slugify(name).slice(0, 40).replace(/-+$/, "") || "video"}.mp4`;
  const shareText = useMemo(() => [name, item.caption].filter(Boolean).join("\n\n"), [name, item.caption]);

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

  return (
    <div ref={ref} className={cn("surface overflow-hidden transition", highlighted && "ring-2 ring-primary/60")}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {showVideo && (
          <video src={item.videoUrl!} poster={item.thumbnailUrl ?? undefined} controls playsInline preload="metadata" className="aspect-[9/16] w-full max-w-[180px] shrink-0 self-center rounded-lg bg-black sm:self-start" />
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium">{name}</p>
              {item.title && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">Thème : {item.topic}</p>}
            </div>
            {statusBadge(item)}
          </div>

          <p className="text-xs text-muted-foreground">
            {now === null ? " " : (
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
                      <s.icon className="h-3 w-3 shrink-0" /> {s.label}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {item.error && item.status === "FAILED" && (
            <p className="flex gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-200"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {item.error}</p>
          )}
          {item.error && item.status !== "FAILED" && item.attempts > 0 && (
            <p className="text-[11px] text-amber-300">Nouvel essai automatique dans quelques minutes (tentative {item.attempts + 1}/3) — {item.error}</p>
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

          <div className="flex flex-wrap items-center gap-1.5">
            {item.caption && showVideo && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={copyCaption}><Copy /> Copier la description</Button>}
            {item.projectId && <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px]"><Link href={`/studio/${item.projectId}`}><ExternalLink /> Ouvrir dans le studio</Link></Button>}
            {item.status === "FAILED" && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" loading={busy === "retry"} disabled={busy !== null} onClick={() => run("retry")}><RotateCcw /> Relancer</Button>}
            {!terminal && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-red-300" loading={busy === "cancel"} disabled={busy !== null} onClick={() => run("cancel")}><X /> Annuler</Button>}
            {terminal && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground" loading={busy === "delete"} disabled={busy !== null} onClick={() => run("delete")}><Trash2 /> Retirer</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
