"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Save, History, Plus, Trash2, GripVertical, Lightbulb, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScoreRing } from "@/components/shared/score-ring";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveScriptEdits, setActiveScript } from "@/server/actions/projects";
import type { StudioScript } from "@/components/studio/types";
import { countWords, cn } from "@/lib/utils";
import { nanoid } from "nanoid";

interface Props {
  projectId: string;
  scripts: StudioScript[];
  activeScriptId: string | null;
  selectedScene: number | null;
  onSelectScene: (i: number | null) => void;
  aiConfigured: boolean;
}

export function ScriptPanel({ projectId, scripts, activeScriptId, selectedScene, onSelectScene, aiConfigured }: Props) {
  const router = useRouter();
  const active = scripts.find((s) => s.id === activeScriptId) ?? scripts[0] ?? null;
  const [draft, setDraft] = useState(active);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(active), [active]);

  if (!active || !draft) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-8 text-center">
        <Sparkles className="mb-3 h-8 w-8 text-brand-300" />
        <p className="font-semibold">Aucun script pour l'instant</p>
        <p className="mt-1 text-sm text-muted-foreground">Générez un hook, des scènes et un CTA avec l'IA.</p>
        <Button asChild variant="gradient" className="mt-4" disabled={!aiConfigured}><Link href={`/scripts?project=${projectId}`}><Sparkles /> Générer un script</Link></Button>
      </div>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(active);
  const words = countWords([draft.hook, ...draft.scenes.map((s) => s.text), draft.callToAction].join(" "));

  const updateScene = (i: number, patch: Partial<StudioScript["scenes"][number]>) => setDraft({ ...draft, scenes: draft.scenes.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const removeScene = (i: number) => setDraft({ ...draft, scenes: draft.scenes.filter((_, k) => k !== i) });
  const addScene = (after: number) => {
    const scenes = [...draft.scenes];
    scenes.splice(after + 1, 0, { id: nanoid(8), text: "", visualDescription: "", brollQuery: "", durationSec: 3, emphasis: [], onScreenText: null });
    setDraft({ ...draft, scenes });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.scenes.length) return;
    const scenes = [...draft.scenes];
    [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
    setDraft({ ...draft, scenes });
  };

  async function save() {
    setSaving(true);
    const res = await saveScriptEdits(active!.id, { title: draft!.title, hook: draft!.hook, callToAction: draft!.callToAction, hashtags: draft!.hashtags, scenes: draft!.scenes.map((s) => ({ id: s.id, text: s.text, visualDescription: s.visualDescription, brollQuery: s.brollQuery, onScreenText: s.onScreenText })) });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Enregistré en version ${res.data.version}. Régénérez la voix off pour mettre à jour le timing.`);
    router.refresh();
  }

  async function switchVersion(id: string) {
    const res = await setActiveScript(projectId, id);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={active.id} onValueChange={switchVersion}>
          <SelectTrigger className="w-40"><History className="mr-1 h-3.5 w-3.5 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent>{scripts.map((s) => <SelectItem key={s.id} value={s.id}>v{s.version} · {new Date(s.createdAt).toLocaleDateString("fr-FR")} · ⚡{s.viralityScore}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="secondary" disabled={!aiConfigured}><Link href={`/scripts?project=${projectId}&topic=${encodeURIComponent(draft.title)}`}><RefreshCw /> Régénérer</Link></Button>
          <Button size="sm" variant="gradient" onClick={save} loading={saving} disabled={!dirty}><Save /> Enregistrer la version</Button>
        </div>
      </div>

      <div className="surface flex items-center justify-around p-4">
        <ScoreRing value={active.viralityScore} size={72} label="Viralité" />
        <ScoreRing value={active.hookScore} size={56} label="Hook" />
        <ScoreRing value={active.retentionScore} size={56} label="Rétention" />
        <ScoreRing value={active.clarityScore} size={56} label="Clarté" />
      </div>
      {active.scoreRationale && <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground"><Lightbulb className="mr-1 inline h-3.5 w-3.5 text-amber-300" />{active.scoreRationale}</p>}

      <div className="space-y-1.5"><Label>Titre</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>

      <div className={cn("space-y-1.5 rounded-lg p-2 -m-2 transition", selectedScene === 0 && "bg-primary/10")} onClick={() => onSelectScene(0)}>
        <Label className="text-brand-300">Hook · 3 premières secondes</Label>
        <Textarea value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} rows={2} className="font-medium" />
        {active.alternativeHooks.length > 0 && (
          <div className="space-y-1 pt-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Alternatives</p>
            {active.alternativeHooks.map((h) => (
              <button key={h} type="button" onClick={() => setDraft({ ...draft, hook: h })} className="block w-full rounded-md border border-white/[0.06] px-2.5 py-1.5 text-left text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground">{h}</button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between"><Label>Scènes ({draft.scenes.length})</Label><span className="text-xs text-muted-foreground">{words} mots · ~{Math.round(words / 2.6)}s</span></div>
        {draft.scenes.map((s, i) => (
          <div key={s.id} onClick={() => onSelectScene(i + 1)} className={cn("group rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition", selectedScene === i + 1 && "border-primary/50 bg-primary/10")}>
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><GripVertical className="h-3.5 w-3.5" /> Scène {i + 1}</span>
              <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                <Button size="icon-sm" variant="ghost" onClick={(e) => { e.stopPropagation(); move(i, -1); }} disabled={i === 0}>↑</Button>
                <Button size="icon-sm" variant="ghost" onClick={(e) => { e.stopPropagation(); move(i, 1); }} disabled={i === draft.scenes.length - 1}>↓</Button>
                <Button size="icon-sm" variant="ghost" onClick={(e) => { e.stopPropagation(); addScene(i); }}><Plus /></Button>
                <Button size="icon-sm" variant="ghost" className="text-red-300" onClick={(e) => { e.stopPropagation(); removeScene(i); }} disabled={draft.scenes.length <= 1}><Trash2 /></Button>
              </div>
            </div>
            <Textarea value={s.text} onChange={(e) => updateScene(i, { text: e.target.value })} rows={2} placeholder="Narration…" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input value={s.brollQuery} onChange={(e) => updateScene(i, { brollQuery: e.target.value })} placeholder="Recherche de b-roll" className="h-8 text-xs" />
              <Input value={s.onScreenText ?? ""} onChange={(e) => updateScene(i, { onScreenText: e.target.value || null })} placeholder="Texte à l'écran (optionnel)" className="h-8 text-xs" />
            </div>
            <p className="mt-1.5 text-[11px] italic text-muted-foreground">{s.visualDescription}</p>
          </div>
        ))}
      </div>

      <div className={cn("space-y-1.5 rounded-lg p-2 -m-2 transition", selectedScene === draft.scenes.length + 1 && "bg-primary/10")} onClick={() => onSelectScene(draft.scenes.length + 1)}>
        <Label className="text-pink-300">Appel à l'action</Label>
        <Textarea value={draft.callToAction} onChange={(e) => setDraft({ ...draft, callToAction: e.target.value })} rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label>Hashtags</Label>
        <Input value={draft.hashtags.map((h) => `#${h}`).join(" ")} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean) })} />
        <p className="text-[11px] text-muted-foreground">Réserve générale. Les hashtags prêts à publier, adaptés à TikTok et Instagram, sont dans l'onglet Export.</p>
      </div>
    </div>
  );
}
