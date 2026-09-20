"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Upload, Trash2, Sparkles, Lock, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/utils";

const READING_SCRIPT =
  "Bonjour, je m'appelle... et voici un échantillon de ma voix pour l'entraînement de mon clone vocal. " +
  "J'aime raconter des histoires, partager des idées et créer du contenu qui capte l'attention dès les premières secondes. " +
  "Que ce soit pour expliquer un sujet complexe ou pour surprendre avec une anecdote, ma voix doit rester claire, naturelle et vivante. " +
  "Parlez normalement, avec vos intonations habituelles, comme si vous vous adressiez directement à la caméra.";

const MIN_SECONDS = 20;
const RECOMMENDED_SECONDS = 60;

/**
 * Left to itself, Chrome records an audio-only stream into a *video* container
 * ("video/webm"), which the upload endpoint rightly refuses. Ask for a real
 * audio container instead, in the order browsers actually support them.
 */
function pickAudioMimeType(): MediaRecorderOptions | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
  const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t));
  return mimeType ? { mimeType } : undefined;
}

interface Props {
  customVoice: { name: string; sampleUrl: string } | null;
  allowed: boolean;
  cost: number;
  credits: number;
  onChange: () => void;
}

export function VoiceCloneCard({ customVoice, allowed, cost, credits, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const recorder = new MediaRecorder(stream, pickAudioMimeType());
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
        setBlob(b);
        setFileDuration(null);
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setRecording(true);
      setElapsed(0);
      setBlob(null);
      timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      toast.error("Micro inaccessible — vérifiez les autorisations du navigateur.");
    }
  }

  function stopRecording() {
    mediaRecorder.current?.stop();
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
  }

  function pickFile(file: File) {
    setBlob(file);
    const audio = new Audio(URL.createObjectURL(file));
    audio.onloadedmetadata = () => setFileDuration(audio.duration);
  }

  function reset() {
    setBlob(null);
    setElapsed(0);
    setFileDuration(null);
    setConsent(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!blob) return;
    if (!consent) return toast.error("Vous devez confirmer que vous avez le droit d'utiliser cette voix.");
    if (credits < cost) return toast.error(`Crédits insuffisants (${credits}/${cost}).`);
    setSubmitting(true);
    const fd = new FormData();
    fd.append("name", name.trim() || "Ma voix");
    fd.append("consent", "true");
    const ext = blob.type.includes("wav") ? "wav" : blob.type.includes("mp4") || blob.type.includes("m4a") ? "m4a" : blob.type.includes("ogg") ? "ogg" : blob.type.includes("webm") ? "webm" : "mp3";
    fd.append("files", blob, `sample.${ext}`);
    const res = await fetch("/api/voice/clone", { method: "POST", body: fd });
    setSubmitting(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return toast.error(body.error ?? "Échec du clonage de voix.");
    }
    toast.success("Votre voix a été clonée avec succès !");
    reset();
    onChange();
  }

  async function remove() {
    setDeleting(true);
    const res = await fetch("/api/voice/clone", { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) return toast.error("Échec de la suppression.");
    toast.success("Voix clonée supprimée.");
    onChange();
  }

  if (!allowed) {
    return (
      <div className="surface p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-brand-300" /> Clonez votre voix <Lock className="h-3.5 w-3.5 text-muted-foreground" /></div>
        <p className="mt-1.5 text-xs text-muted-foreground">Enregistrez un échantillon et générez vos voix off avec votre propre voix, clonée par IA. Réservé aux forfaits Pro et Agence.</p>
      </div>
    );
  }

  const duration = fileDuration ?? elapsed;
  const tooShort = blob && duration > 0 && duration < MIN_SECONDS;

  return (
    <div className="surface space-y-3 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-brand-300" /> Votre voix clonée par IA</div>

      {customVoice && !blob && (
        <div className="rounded-lg border border-primary/60 bg-primary/10 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{customVoice.name}</span>
            <Button size="icon-sm" variant="ghost" aria-label="Supprimer ma voix clonée" loading={deleting} onClick={remove}><Trash2 /></Button>
          </div>
          <audio controls src={customVoice.sampleUrl} className="mt-2 h-8 w-full" />
          <p className="mt-1.5 text-[11px] text-muted-foreground">Sélectionnez « {customVoice.name} » dans la liste des voix ci-dessus pour l'utiliser.</p>
        </div>
      )}

      {!blob ? (
        <>
          <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-3 text-xs italic leading-relaxed text-muted-foreground">{READING_SCRIPT}</p>
          <div className="flex flex-wrap items-center gap-2">
            {!recording ? (
              <Button size="sm" variant="secondary" onClick={startRecording}><Mic /> Démarrer l'enregistrement</Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={stopRecording}><Square /> Arrêter · {formatDuration(elapsed * 1000)}</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}><Upload /> Importer un fichier audio</Button>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
          </div>
          <p className="text-[11px] text-muted-foreground">Visez au moins {RECOMMENDED_SECONDS} secondes d'une voix claire, sans bruit de fond, pour un meilleur résultat.</p>
        </>
      ) : (
        <div className="space-y-3">
          <audio controls src={URL.createObjectURL(blob)} className="h-8 w-full" />
          {tooShort && <p className="text-[11px] text-amber-300">Échantillon très court ({Math.round(duration)}s) — la qualité du clone sera limitée. Visez au moins {MIN_SECONDS}s.</p>}
          <div className="space-y-1.5">
            <Label>Nom de la voix</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ma voix" maxLength={60} />
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/20 bg-transparent accent-primary" />
            Je certifie qu'il s'agit de ma propre voix, ou que j'ai l'autorisation explicite de la personne enregistrée pour cloner sa voix.
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={reset}>Annuler</Button>
            <Button size="sm" variant="gradient" className="flex-1" disabled={!consent || credits < cost} loading={submitting} onClick={submit}>
              <Sparkles /> {customVoice ? "Remplacer ma voix" : "Créer ma voix"} · <Coins className="h-3.5 w-3.5" /> {cost}
            </Button>
          </div>
          {credits < cost && <p className="text-[11px] text-red-300">Crédits insuffisants ({credits}/{cost}).</p>}
        </div>
      )}
    </div>
  );
}
