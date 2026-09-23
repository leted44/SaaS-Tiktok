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
const IDEAS = [
  "3 erreurs qui ruinent ton sommeil, et quoi faire à la place",
  "La règle des 3 secondes qui rend n'importe quel TikTok viral",
  "Pourquoi 90 % des gens échouent à épargner",
];

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
    <div id="quick-create" className="relative scroll-mt-24">
      {/* Glow behind the card */}
      <div aria-hidden className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-[radial-gradient(60%_60%_at_30%_40%,rgba(139,92,246,0.35),transparent_70%),radial-gradient(50%_60%_at_80%_70%,rgba(236,72,153,0.22),transparent_70%)] blur-2xl" />
      <div className="relative rounded-[1.75rem] bg-gradient-to-br from-violet-500/70 via-fuchsia-500/40 to-orange-400/60 p-px shadow-[0_30px_80px_-30px_rgba(124,58,237,0.7)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
          className="rounded-[calc(1.75rem-1px)] bg-[#0c0916]/95 p-4 backdrop-blur-xl sm:p-6"
        >
          <label htmlFor="qc-topic" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient shadow-glow-sm"><Sparkles className="h-3.5 w-3.5 text-white" /></span>
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
            className="mt-3 w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-base leading-relaxed text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-violet-400/50 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(139,92,246,0.12)] disabled:opacity-60 sm:text-[17px]"
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
                  : <>Hook, scènes et score de viralité en quelques secondes{cost > 0 ? ` · ${cost} crédit${cost > 1 ? "s" : ""}` : ""}. Ensuite, le studio pour la voix, les visuels et l'export. <span className="hidden sm:inline">⌘/Ctrl + Entrée</span></>}
            </p>
            <button
              type="submit"
              disabled={!ready}
              className="group/cta relative inline-flex h-12 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-brand-gradient px-6 text-sm font-semibold text-white shadow-[0_10px_40px_-10px_rgba(219,39,119,0.8)] transition duration-300 hover:shadow-[0_14px_50px_-8px_rgba(219,39,119,0.95)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none motion-safe:active:scale-[0.98]"
            >
              <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover/cta:translate-x-full" />
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Écriture du script…</> : <><Wand2 className="h-4 w-4" /> Créer ma vidéo <ArrowRight className="h-4 w-4 transition-transform motion-safe:group-hover/cta:translate-x-0.5" /></>}
            </button>
          </div>

          {!topic && !loading && (
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/70">Besoin d'inspiration ?</p>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
                {IDEAS.map((idea) => (
                  <button key={idea} type="button" onClick={() => { setTopic(idea); textRef.current?.focus(); }} className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-left text-xs text-muted-foreground transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-foreground">
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
