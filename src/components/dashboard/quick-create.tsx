"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Link2, Loader2, SlidersHorizontal, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { generateScriptAction } from "@/server/actions/scripts";
import { TONES, TONE_LABELS, type Tone } from "@/lib/autopilot/template-shared";
import { cn } from "@/lib/utils";

const DURATIONS = [30, 45, 60];

interface Props {
  aiConfigured: boolean;
  credits: number;
  /** Credits one script costs this account (0 when not billed). */
  cost: number;
  language: string;
}

/**
 * The dashboard's main entry point: an idea in, a written script and its
 * project out, then straight into the studio — the same generation as the
 * script generator page, with its most used settings inline.
 */
export function QuickCreate({ aiConfigured, credits, cost, language }: Props) {
  const router = useRouter();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [topic, setTopic] = useState("");
  const [withUrl, setWithUrl] = useState(false);
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState(45);
  const [tone, setTone] = useState<Tone>("energetic");
  const [loading, setLoading] = useState(false);

  const enough = credits >= cost;
  const urlValid = !withUrl || url.trim() === "" || /^https?:\/\/\S+\.\S+/.test(url.trim());
  const ready = topic.trim().length >= 3 && urlValid && aiConfigured && enough && !loading;

  async function generate() {
    if (topic.trim().length < 3) {
      textRef.current?.focus();
      return toast.error("Décris ton idée en quelques mots.");
    }
    if (!urlValid) return toast.error("Ce lien n'est pas une adresse web valide.");
    setLoading(true);
    const res = await generateScriptAction({
      topic: topic.trim(),
      sourceUrl: withUrl && url.trim() ? url.trim() : undefined,
      tone,
      targetDurationSec: duration,
      language,
    });
    if (!res.ok) {
      setLoading(false);
      toast.error(res.error, { action: res.code === "INSUFFICIENT_CREDITS" ? { label: "Obtenir des crédits", onClick: () => router.push("/billing") } : undefined });
      return;
    }
    toast.success(`Script prêt — viralité ${res.data.viralityScore}/100`, { description: "Direction le studio pour la voix, les visuels et l'export." });
    router.push(`/studio/${res.data.projectId}`);
  }

  return (
    <div id="quick-create" className="scroll-mt-24">
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)] transition focus-within:border-violet-400/30">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
          className="p-4 sm:p-6"
        >
          <label htmlFor="qc-topic" className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-brand-300" />
            Que veux-tu créer ?
          </label>

          <textarea
            ref={textRef}
            id="qc-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void generate();
              }
            }}
            rows={3}
            maxLength={1200}
            disabled={loading}
            placeholder="Décris ton idée… ex. « Le sport fait grossir ton cerveau : ce que dit la science »"
            className="mt-3 w-full resize-none rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3.5 text-base leading-relaxed text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-white/15 focus:bg-white/[0.04] disabled:opacity-60 sm:text-[17px]"
          />

          {withUrl && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1">
              <Link2 className="h-4 w-4 shrink-0 text-brand-300" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                inputMode="url"
                placeholder="https://article-ou-video-a-reprendre.com"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
              <button type="button" aria-label="Retirer le lien" onClick={() => { setWithUrl(false); setUrl(""); }} className="rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!withUrl && (
              <button type="button" onClick={() => setWithUrl(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs text-muted-foreground transition hover:border-white/25 hover:text-foreground">
                <Link2 className="h-3.5 w-3.5" /> Partir d'un lien
              </button>
            )}
            <div className="inline-flex h-8 items-center rounded-full border border-white/10 p-0.5" role="radiogroup" aria-label="Durée">
              {DURATIONS.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={duration === d} onClick={() => setDuration(d)} className={cn("h-full rounded-full px-2.5 text-xs transition", duration === d ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {d} s
                </button>
              ))}
            </div>
            <label className="relative inline-flex h-8 items-center rounded-full border border-white/10 pl-3 pr-2 text-xs text-muted-foreground transition focus-within:border-white/25 hover:border-white/25">
              <span className="sr-only">Ton</span>
              <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className="h-full cursor-pointer appearance-none bg-transparent pr-4 text-foreground outline-none">
                {TONES.map((t) => <option key={t} value={t} className="bg-background">{TONE_LABELS[t]}</option>)}
              </select>
              <span aria-hidden className="pointer-events-none absolute right-2.5 text-[9px]">▾</span>
            </label>
            <Link href={`/scripts${topic.trim() ? `?topic=${encodeURIComponent(topic.trim())}` : ""}`} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs text-muted-foreground transition hover:text-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Plus d'options
            </Link>
          </div>

          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-muted-foreground sm:max-w-sm">
              {!aiConfigured
                ? "La génération IA n'est pas configurée sur ce serveur (clé Anthropic manquante)."
                : !enough
                  ? `Il faut ${cost} crédit${cost > 1 ? "s" : ""} pour un script — ton solde est de ${credits}.`
                  : <>Le script est écrit en quelques secondes, puis tu continues dans le studio{cost > 0 ? ` · ${cost} crédit${cost > 1 ? "s" : ""}` : ""}.</>}
            </p>
            <button
              type="submit"
              disabled={!ready}
              className="group/cta relative inline-flex h-12 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-brand-gradient px-6 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(219,39,119,0.6)] transition duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none motion-safe:active:scale-[0.98]"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Écriture du script…</> : <><Wand2 className="h-4 w-4" /> Créer ma vidéo <ArrowRight className="h-4 w-4 transition-transform motion-safe:group-hover/cta:translate-x-0.5" /></>}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
