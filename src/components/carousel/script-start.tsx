"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, GalleryHorizontalEnd, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { generateScriptAction } from "@/server/actions/scripts";
import { AUTO_NICHE, CTA_GOALS, HOOK_STYLES, NICHES, type CtaGoal, type HookStyle } from "@/lib/scripts/options";
import { TONES, TONE_LABELS, type Tone } from "@/lib/autopilot/template-shared";
import { CarouselLengthPicker } from "@/components/shared/carousel-length-picker";
import type { CarouselLength } from "@/lib/carousel/schema";

const SELECT = "h-10 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-foreground outline-none transition focus:border-white/25";

/**
 * The carousel of a project that has no script yet — a project created from
 * "Nouveau projet" in Carrousel mode. The script is written right here, from
 * the topic already given, instead of sending the user to the video studio
 * to write it and back.
 */
export function ScriptStart({ projectId, topic: initialTopic, niche: initialNiche, language, cost, credits, aiConfigured }: { projectId: string; topic: string; niche: string | null; language: string; cost: number; credits: number; aiConfigured: boolean }) {
  const router = useRouter();
  const [topic, setTopic] = useState(initialTopic);
  // A niche typed by hand when the project was created stays offered, next to the standard ones.
  const nicheOptions = initialNiche && initialNiche !== AUTO_NICHE && !NICHES.includes(initialNiche) ? [initialNiche, ...NICHES] : NICHES;
  const [niche, setNiche] = useState(initialNiche?.trim() || AUTO_NICHE);
  const [tone, setTone] = useState<Tone>("energetic");
  const [hookStyle, setHookStyle] = useState<HookStyle>("auto");
  const [cta, setCta] = useState<CtaGoal>("follow");
  const [length, setLength] = useState<CarouselLength>("short");
  const [loading, setLoading] = useState(false);

  const enough = credits >= cost;

  async function write() {
    if (topic.trim().length < 3) return toast.error("Décris d'abord le sujet du carrousel.");
    setLoading(true);
    try {
      const res = await generateScriptAction({
        projectId,
        topic: topic.trim(),
        niche,
        tone,
        hookStyle,
        callToActionGoal: cta,
        language,
        targetDurationSec: 45,
        carouselLength: length,
      });
      if (!res.ok) {
        toast.error(res.error, { action: res.code === "INSUFFICIENT_CREDITS" ? { label: "Obtenir des crédits", onClick: () => router.push("/billing") } : undefined });
        return;
      }
      toast.success("Script prêt — relis-le, puis crée le carrousel.");
      router.refresh();
    } catch {
      toast.error("La génération a échoué (délai dépassé ou connexion perdue). Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface space-y-5 p-5">
      <div>
        <GalleryHorizontalEnd className="h-6 w-6 text-brand-300" />
        <h2 className="mt-2 font-display text-lg font-bold">D'abord, le script</h2>
        <p className="mt-1 text-sm text-muted-foreground">Le carrousel est écrit à partir d'un script. Vérifie le sujet, l'IA écrit le script en quelques secondes, puis tu choisis la couverture et les images.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Format du post</Label>
        <CarouselLengthPicker value={length} onChange={setLength} className="flex h-10 w-full" />
        <p className="text-[11px] text-muted-foreground">Le script est écrit pour ce nombre de slides : ni idée de trop, ni remplissage.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cs-topic">Sujet, idée ou angle</Label>
        <Textarea id="cs-topic" value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} maxLength={1200} disabled={loading} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Niche</span>
          <select value={niche} onChange={(e) => setNiche(e.target.value)} className={SELECT} disabled={loading}>
            <option value={AUTO_NICHE} className="bg-background">Déduite du sujet</option>
            {nicheOptions.map((n) => <option key={n} value={n} className="bg-background">{n}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ton</span>
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className={SELECT} disabled={loading}>
            {TONES.map((t) => <option key={t} value={t} className="bg-background">{TONE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Style d'accroche</span>
          <select value={hookStyle} onChange={(e) => setHookStyle(e.target.value as HookStyle)} className={SELECT} disabled={loading}>
            {HOOK_STYLES.map((h) => <option key={h.id} value={h.id} className="bg-background">{h.label}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Appel à l'action</span>
          <select value={cta} onChange={(e) => setCta(e.target.value as CtaGoal)} className={SELECT} disabled={loading}>
            {CTA_GOALS.map((c) => <option key={c.id} value={c.id} className="bg-background">{c.label}</option>)}
          </select>
        </label>
      </div>

      <div>
        <Button variant="gradient" className="w-full" onClick={write} loading={loading} disabled={!aiConfigured || !enough || topic.trim().length < 3}>
          <Sparkles /> Écrire le script {cost > 0 && <><Coins className="h-3.5 w-3.5" /> {cost}</>}
        </Button>
        {!aiConfigured && <p className="mt-2 text-xs text-red-300">La génération IA n'est pas configurée sur ce serveur.</p>}
        {aiConfigured && !enough && <p className="mt-2 text-xs text-red-300">Crédits insuffisants ({credits}/{cost}).</p>}
      </div>
    </div>
  );
}
