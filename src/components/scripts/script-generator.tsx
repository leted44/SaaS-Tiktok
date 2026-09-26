"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Link2, Wand2, ArrowRight, Coins } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { UpgradePrompt } from "@/components/shared/upgrade-prompt";
import { generateScriptAction } from "@/server/actions/scripts";
import { FormatPicker } from "@/components/shared/format-picker";
import { formatDestination, type ContentFormat } from "@/lib/format";
import { cn } from "@/lib/utils";

const NICHES = ["Finance", "Fitness", "Santé", "Tech", "Business", "Marketing", "Motivation", "Éducation", "Beauté", "Cuisine", "Voyage", "Gaming", "Immobilier", "Parentalité", "Psychologie"];
const TONES = [
  { id: "energetic", label: "Énergique" },
  { id: "educational", label: "Éducatif" },
  { id: "storytelling", label: "Storytelling" },
  { id: "controversial", label: "Polémique" },
  { id: "calm", label: "Calme" },
  { id: "humorous", label: "Humoristique" },
] as const;
const HOOKS = [
  { id: "auto", label: "Laisser l'IA décider" },
  { id: "question", label: "Question" },
  { id: "bold-claim", label: "Affirmation forte" },
  { id: "curiosity-gap", label: "Vide de curiosité" },
  { id: "story", label: "Ouverture narrative" },
  { id: "statistic", label: "Statistique choc" },
] as const;
const LANGS = [["fr", "Français"], ["en", "Anglais"], ["es", "Espagnol"], ["de", "Allemand"], ["pt", "Portugais"], ["it", "Italien"], ["nl", "Néerlandais"], ["ja", "Japonais"]];
const STEPS = ["Analyse du sujet", "Rédaction des hooks", "Structuration des scènes", "Calcul du score de viralité"];
const NO_SPACE = "__none__";
interface SpaceOption {
  id: string;
  name: string;
  color: string;
  language: string | null;
  tone: string | null;
}

const EXAMPLES = [
  "Pourquoi 90% des gens échouent à épargner (et la seule règle qui règle ça)",
  "La règle des 3 secondes qui rend n'importe quel TikTok viral",
  "Comment j'apprendrais à coder en 2026 si je devais tout recommencer",
  "La routine matinale que les neurosciences valident vraiment",
];

export function ScriptGenerator({ credits, cost, aiConfigured, projectId, initialTopic, initialFormat, spaces = [] }: { credits: number; cost: number; aiConfigured: boolean; projectId?: string; initialTopic?: string; initialFormat?: ContentFormat; spaces?: SpaceOption[] }) {
  const router = useRouter();
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [sourceUrl, setSourceUrl] = useState("");
  const [niche, setNiche] = useState("Business");
  const [tone, setTone] = useState<(typeof TONES)[number]["id"]>("energetic");
  const [hookStyle, setHookStyle] = useState<(typeof HOOKS)[number]["id"]>("auto");
  const [language, setLanguage] = useState("fr");
  const [duration, setDuration] = useState(45);
  const [cta, setCta] = useState("follow");
  const [audience, setAudience] = useState("");
  const [spaceId, setSpaceId] = useState(NO_SPACE);
  const [format, setFormat] = useState<ContentFormat>(initialFormat ?? "video");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  // Comes from the server already resolved, so an ADMIN account on zero credits
  // isn't blocked here by a price the server would never charge it.
  const canGenerate = credits >= cost;

  /** Only a starting point — the space's own language/ton are proposed, never forced. */
  function pickSpace(id: string) {
    setSpaceId(id);
    const space = spaces.find((s) => s.id === id);
    if (space?.language) setLanguage(space.language);
    if (space?.tone) setTone(space.tone as (typeof TONES)[number]["id"]);
  }

  async function onGenerate() {
    if (topic.trim().length < 3) return toast.error("Décrivez d'abord votre sujet.");
    setLoading(true);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 2200);
    try {
      const res = await generateScriptAction({ projectId, spaceId: projectId ? undefined : spaceId === NO_SPACE ? null : spaceId, topic, sourceUrl: sourceUrl || undefined, niche, tone, hookStyle, language, targetDurationSec: duration, callToActionGoal: cta, audience: audience || undefined });
      if (!res.ok) {
        toast.error(res.error, { action: res.code === "INSUFFICIENT_CREDITS" ? { label: "Obtenir des crédits", onClick: () => router.push("/billing") } : undefined });
        return;
      }
      toast.success(`Script v${res.data.version} prêt — viralité ${res.data.viralityScore}/100`, { description: `${res.data.creditsLeft} crédits restants` });
      router.push(projectId ? `/studio/${res.data.projectId}` : formatDestination(format, res.data.projectId));
    } catch {
      // A dead network call or a killed server function never reaches `res.ok` —
      // without this, the button spins on "Calcul du score de viralité" forever.
      toast.error("La génération a échoué (délai dépassé ou connexion perdue). Réessayez.");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {!aiConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          La génération IA nécessite <code className="rounded bg-black/30 px-1">ANTHROPIC_API_KEY</code>. Ajoutez-la à votre environnement pour activer ce module.
        </div>
      )}
      {!canGenerate && <UpgradePrompt compact />}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] bg-brand-gradient-soft px-6 py-4">
          <p className="inline-flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4 text-brand-300" /> Brief</p>
          {!projectId && <FormatPicker value={format} onChange={setFormat} />}
        </div>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="topic">Sujet, idée ou angle</Label>
            <Textarea id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} rows={4} placeholder="ex. Pourquoi la plupart des gens abandonnent la salle après 3 semaines, et le déclic qui change tout" className="text-base" />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setTopic(ex)} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground">{ex.slice(0, 44)}…</button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="url" className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> URL source (optionnel)</Label>
            <Input id="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://article-ou-video-a-reprendre.com" />
          </div>

          {!projectId && spaces.length > 0 && (
            <div className="space-y-1.5">
              <Label>Espace</Label>
              <Select value={spaceId} onValueChange={pickSpace}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SPACE}>Aucun espace</SelectItem>
                  {spaces.map((s) => <SelectItem key={s.id} value={s.id}><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.color }} />{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Niche</Label>
              <Select value={niche} onValueChange={setNiche}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NICHES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Style de hook</Label>
              <Select value={hookStyle} onValueChange={(v) => setHookStyle(v as typeof hookStyle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{HOOKS.map((h) => <SelectItem key={h.id} value={h.id}>{h.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Langue</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANGS.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ton</Label>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button key={t.id} type="button" onClick={() => setTone(t.id)} className={cn("rounded-lg border px-3 py-1.5 text-sm transition", tone === t.id ? "border-primary/60 bg-primary/15 text-foreground shadow-glow-sm" : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground")}>{t.label}</button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {format !== "carousel" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between"><Label>Durée cible</Label><span className="text-sm font-semibold tabular-nums">{duration}s</span></div>
                <Slider value={[duration]} min={15} max={120} step={5} onValueChange={([v]) => setDuration(v)} />
                <p className="text-xs text-muted-foreground">≈ {Math.round(duration * 2.6)} mots parlés</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Appel à l'action</Label>
              <Select value={cta} onValueChange={setCta}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow">Inciter à suivre</SelectItem>
                  <SelectItem value="comment">Inciter à commenter</SelectItem>
                  <SelectItem value="share">Inciter à partager</SelectItem>
                  <SelectItem value="link">Lien en bio</SelectItem>
                  <SelectItem value="none">Aucun CTA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audience">Audience (optionnel)</Label>
            <Input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="ex. Primo-entrepreneurs de 25-35 ans" />
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.05] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Coins className="h-3.5 w-3.5" /> {cost === 0 ? "Gratuit sur ce compte" : `Coûte ${cost} crédit · ${credits} disponible${credits > 1 ? "s" : ""}`}</p>
            <Button size="lg" variant="gradient" onClick={onGenerate} loading={loading} disabled={!canGenerate || !aiConfigured}>
              {loading ? STEPS[step] : <><Sparkles /> {!projectId && format === "carousel" ? "Générer le script et le carrousel" : "Générer le script"} <ArrowRight /></>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="surface p-5">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-primary" /></span>
              <p className="text-sm font-medium">{STEPS[step]}…</p>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {STEPS.map((s, i) => (
                <div key={s} className={cn("h-1.5 rounded-full transition-colors", i <= step ? "bg-brand-gradient" : "bg-white/10")} />
              ))}
            </div>
            <div className="mt-5 space-y-2">
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-11/12" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
