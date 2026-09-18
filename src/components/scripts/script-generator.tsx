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
import { CREDIT_COSTS } from "@/lib/plans";
import { cn } from "@/lib/utils";

const NICHES = ["Finance", "Fitness", "Health", "Tech", "Business", "Marketing", "Motivation", "Education", "Beauty", "Food", "Travel", "Gaming", "Real estate", "Parenting", "Psychology"];
const TONES = [
  { id: "energetic", label: "Energetic" },
  { id: "educational", label: "Educational" },
  { id: "storytelling", label: "Storytelling" },
  { id: "controversial", label: "Controversial" },
  { id: "calm", label: "Calm" },
  { id: "humorous", label: "Humorous" },
] as const;
const HOOKS = [
  { id: "auto", label: "Let AI decide" },
  { id: "question", label: "Question" },
  { id: "bold-claim", label: "Bold claim" },
  { id: "curiosity-gap", label: "Curiosity gap" },
  { id: "story", label: "Story opener" },
  { id: "statistic", label: "Shocking statistic" },
] as const;
const LANGS = [["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"], ["it", "Italian"], ["nl", "Dutch"], ["ja", "Japanese"]];
const STEPS = ["Analyzing topic", "Crafting hooks", "Structuring scenes", "Scoring virality"];

const EXAMPLES = [
  "Why 90% of people fail at saving money (and the 1 rule that fixes it)",
  "The 3-second rule that makes any TikTok go viral",
  "How I'd learn to code in 2026 if I had to start over",
  "The morning routine that neuroscience actually supports",
];

export function ScriptGenerator({ credits, aiConfigured, projectId, initialTopic }: { credits: number; aiConfigured: boolean; projectId?: string; initialTopic?: string }) {
  const router = useRouter();
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [sourceUrl, setSourceUrl] = useState("");
  const [niche, setNiche] = useState("Business");
  const [tone, setTone] = useState<(typeof TONES)[number]["id"]>("energetic");
  const [hookStyle, setHookStyle] = useState<(typeof HOOKS)[number]["id"]>("auto");
  const [language, setLanguage] = useState("en");
  const [duration, setDuration] = useState(45);
  const [cta, setCta] = useState("follow");
  const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  const canGenerate = credits >= CREDIT_COSTS.SCRIPT_GENERATION;

  async function onGenerate() {
    if (topic.trim().length < 3) return toast.error("Describe your topic first.");
    setLoading(true);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 2200);
    const res = await generateScriptAction({ projectId, topic, sourceUrl: sourceUrl || undefined, niche, tone, hookStyle, language, targetDurationSec: duration, callToActionGoal: cta, audience: audience || undefined });
    clearInterval(timer);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error, { action: res.code === "INSUFFICIENT_CREDITS" ? { label: "Get credits", onClick: () => router.push("/billing") } : undefined });
      return;
    }
    toast.success(`Script v${res.data.version} ready — virality ${res.data.viralityScore}/100`, { description: `${res.data.creditsLeft} credits left` });
    router.push(`/studio/${res.data.projectId}`);
  }

  return (
    <div className="space-y-4">
      {!aiConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          AI generation needs <code className="rounded bg-black/30 px-1">ANTHROPIC_API_KEY</code>. Add it to your environment to enable this module.
        </div>
      )}
      {!canGenerate && <UpgradePrompt compact />}

      <Card className="overflow-hidden">
        <div className="border-b border-white/[0.05] bg-brand-gradient-soft px-6 py-4">
          <p className="inline-flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4 text-brand-300" /> Brief</p>
        </div>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic, idea or angle</Label>
            <Textarea id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} rows={4} placeholder="e.g. Why most people quit the gym after 3 weeks and the identity shift that fixes it" className="text-base" />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setTopic(ex)} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground">{ex.slice(0, 44)}…</button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="url" className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> Source URL (optional)</Label>
            <Input id="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://article-or-video-to-repurpose.com" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Niche</Label>
              <Select value={niche} onValueChange={setNiche}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NICHES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hook style</Label>
              <Select value={hookStyle} onValueChange={(v) => setHookStyle(v as typeof hookStyle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{HOOKS.map((h) => <SelectItem key={h.id} value={h.id}>{h.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANGS.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tone</Label>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button key={t.id} type="button" onClick={() => setTone(t.id)} className={cn("rounded-lg border px-3 py-1.5 text-sm transition", tone === t.id ? "border-primary/60 bg-primary/15 text-foreground shadow-glow-sm" : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground")}>{t.label}</button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between"><Label>Target duration</Label><span className="text-sm font-semibold tabular-nums">{duration}s</span></div>
              <Slider value={[duration]} min={15} max={120} step={5} onValueChange={([v]) => setDuration(v)} />
              <p className="text-xs text-muted-foreground">≈ {Math.round(duration * 2.6)} spoken words</p>
            </div>
            <div className="space-y-1.5">
              <Label>Call-to-action</Label>
              <Select value={cta} onValueChange={setCta}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow">Follow for more</SelectItem>
                  <SelectItem value="comment">Ask for comments</SelectItem>
                  <SelectItem value="share">Ask to share</SelectItem>
                  <SelectItem value="link">Link in bio</SelectItem>
                  <SelectItem value="none">No CTA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audience">Audience (optional)</Label>
            <Input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. 25-35 y/o first-time founders" />
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.05] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Coins className="h-3.5 w-3.5" /> Costs {CREDIT_COSTS.SCRIPT_GENERATION} credit · {credits} available</p>
            <Button size="lg" variant="gradient" onClick={onGenerate} loading={loading} disabled={!canGenerate || !aiConfigured}>
              {loading ? STEPS[step] : <><Sparkles /> Generate script <ArrowRight /></>}
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
