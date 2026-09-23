"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Save, History, Plus, Trash2, GripVertical, Lightbulb, RefreshCw, ChevronDown, Hash } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { ScoreRing } from "@/components/shared/score-ring";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveScriptEdits, setActiveScript } from "@/server/actions/projects";
import { SeriesDialog } from "@/components/studio/series-dialog";
import type { StudioScript } from "@/components/studio/types";
import { countWords, cn } from "@/lib/utils";
import { nanoid } from "nanoid";

type Scene = StudioScript["scenes"][number];

interface Props {
  projectId: string;
  scripts: StudioScript[];
  activeScriptId: string | null;
  selectedScene: number | null;
  onSelectScene: (i: number | null) => void;
  aiConfigured: boolean;
  /** Credit price of one generated script — zero for accounts that aren't charged. */
  scriptCost: number;
}

export function ScriptPanel({ projectId, scripts, activeScriptId, selectedScene, onSelectScene, aiConfigured, scriptCost }: Props) {
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

  const updateScene = (i: number, patch: Partial<Scene>) => setDraft({ ...draft, scenes: draft.scenes.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
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
    <div className="space-y-3">
      {/* The writing surface comes first; Enregistrer stays reachable at all times because it is the only way the edits survive. */}
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">v{active.version} · {words} mots · ~{Math.round(words / 2.6)}s</span>
        <Button size="sm" variant="gradient" onClick={save} loading={saving} disabled={!dirty} className="ml-auto shrink-0"><Save /> Enregistrer</Button>
      </div>

      <ScoreCard script={active} stale={dirty} />

      <div className="space-y-1.5"><Label>Titre</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>

      <div className={cn("space-y-1.5 rounded-lg p-2 -m-2 transition", selectedScene === 0 && "bg-primary/10")} onClick={() => onSelectScene(0)}>
        <Label className="text-brand-300">Hook · 3 premières secondes</Label>
        <Textarea value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} rows={2} className="font-medium" />
        {active.alternativeHooks.length > 0 && (
          <AlternativeHooks hooks={active.alternativeHooks} onPick={(h) => setDraft({ ...draft, hook: h })} />
        )}
      </div>

      <div className="space-y-2 pt-1">
        <Label>Scènes ({draft.scenes.length})</Label>
        {draft.scenes.map((s, i) => (
          <SceneRow
            key={s.id}
            scene={s}
            index={i}
            total={draft.scenes.length}
            selected={selectedScene === i + 1}
            onSelect={() => onSelectScene(i + 1)}
            onPatch={(patch) => updateScene(i, patch)}
            onMove={(dir) => move(i, dir)}
            onAdd={() => addScene(i)}
            onRemove={() => removeScene(i)}
          />
        ))}
      </div>

      <div className={cn("space-y-1.5 rounded-lg p-2 -m-2 transition", selectedScene === draft.scenes.length + 1 && "bg-primary/10")} onClick={() => onSelectScene(draft.scenes.length + 1)}>
        <Label className="text-pink-300">Appel à l'action</Label>
        <Textarea value={draft.callToAction} onChange={(e) => setDraft({ ...draft, callToAction: e.target.value })} rows={2} />
      </div>

      <div className="space-y-3 pt-2">
        <Section title="Hashtags" icon={Hash} count={draft.hashtags.length} summary={draft.hashtags.length ? draft.hashtags.slice(0, 3).map((h) => `#${h}`).join(" ") : "Aucun"}>
          <div className="space-y-1.5">
            <Input value={draft.hashtags.map((h) => `#${h}`).join(" ")} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean) })} />
            <p className="text-[11px] text-muted-foreground">Réserve générale. Les hashtags prêts à publier, adaptés à TikTok et Instagram, sont dans l&apos;onglet Export.</p>
          </div>
        </Section>

        <Section title="Versions et variantes" icon={History} summary={`${scripts.length} version${scripts.length > 1 ? "s" : ""}`}>
          <div className="space-y-2">
            <Select value={active.id} onValueChange={switchVersion}>
              <SelectTrigger className="w-full"><History className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><SelectValue /></SelectTrigger>
              <SelectContent>{scripts.map((s) => <SelectItem key={s.id} value={s.id}>v{s.version} · {new Date(s.createdAt).toLocaleDateString("fr-FR")} · ⚡{s.viralityScore}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild size="sm" variant="secondary" disabled={!aiConfigured}><Link href={`/scripts?project=${projectId}&topic=${encodeURIComponent(draft.title)}`}><RefreshCw /> Régénérer</Link></Button>
              <SeriesDialog scriptId={active.id} costPerEpisode={scriptCost} aiConfigured={aiConfigured} />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

/**
 * The AI's verdict on the script, at the top of the tab.
 *
 * It is the first thing worth knowing about a generated script — whether it
 * is worth editing or regenerating — so it sits above the text rather than
 * folded away under it. The four numbers are always visible; the reasoning,
 * a paragraph long, opens on demand so the script stays within reach.
 */
function ScoreCard({ script, stale }: { script: StudioScript; stale: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-around">
        <ScoreRing value={script.viralityScore} size={64} label="Viralité" />
        <ScoreRing value={script.hookScore} size={52} label="Hook" />
        <ScoreRing value={script.retentionScore} size={52} label="Rétention" />
        <ScoreRing value={script.clarityScore} size={52} label="Clarté" />
      </div>
      {stale && (
        <p className="mt-2 text-center text-[11px] text-amber-300">Score de la version enregistrée — tes modifications en cours ne sont pas encore notées.</p>
      )}
      {script.scoreRationale && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            <Lightbulb className="h-3 w-3 text-amber-300" />
            Pourquoi ce score ?
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </button>
          {open && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{script.scoreRationale}</p>}
        </>
      )}
    </div>
  );
}

/**
 * The AI's spare hooks.
 *
 * Three full sentences stacked under the hook pushed the scenes off the first
 * screen for something most edits never touch — one tap away is enough.
 */
function AlternativeHooks({ hooks, onPick }: { hooks: string[]; onPick: (h: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-0.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        {hooks.length} accroche{hooks.length > 1 ? "s" : ""} alternative{hooks.length > 1 ? "s" : ""}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {hooks.map((h) => (
            <button key={h} type="button" onClick={(e) => { e.stopPropagation(); onPick(h); }} className="block w-full rounded-md border border-white/[0.06] px-2.5 py-1.5 text-left text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground">{h}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One scene.
 *
 * Only the narration is edited on every pass, so the b-roll query, the
 * on-screen text and the AI's visual note fold away — and the row's actions no
 * longer hide behind `group-hover`, which a touch screen can never trigger.
 */
function SceneRow({ scene, index, total, selected, onSelect, onPatch, onMove, onAdd, onRemove }: {
  scene: Scene;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<Scene>) => void;
  onMove: (dir: -1 | 1) => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div onClick={onSelect} className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition", selected && "border-primary/50 bg-primary/10")}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><GripVertical className="h-3.5 w-3.5" /> Scène {index + 1}</span>
        <div className="flex gap-0.5">
          <Button size="icon-sm" variant="ghost" aria-label="Monter" onClick={stop(() => onMove(-1))} disabled={index === 0}>↑</Button>
          <Button size="icon-sm" variant="ghost" aria-label="Descendre" onClick={stop(() => onMove(1))} disabled={index === total - 1}>↓</Button>
          <Button size="icon-sm" variant="ghost" aria-label="Ajouter une scène" onClick={stop(onAdd)}><Plus /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Supprimer la scène" className="text-red-300" onClick={stop(onRemove)} disabled={total <= 1}><Trash2 /></Button>
        </div>
      </div>

      <Textarea value={scene.text} onChange={(e) => onPatch({ text: e.target.value })} rows={2} placeholder="Narration…" />

      <button
        type="button"
        onClick={stop(() => setOpen((o) => !o))}
        className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        Visuel et texte à l&apos;écran
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input value={scene.brollQuery} onChange={(e) => onPatch({ brollQuery: e.target.value })} placeholder="Recherche de b-roll" className="h-8 text-xs" />
            <Input value={scene.onScreenText ?? ""} onChange={(e) => onPatch({ onScreenText: e.target.value || null })} placeholder="Texte à l'écran" className="h-8 text-xs" />
          </div>
          {scene.visualDescription && <p className="text-[11px] italic text-muted-foreground">{scene.visualDescription}</p>}
        </div>
      )}
    </div>
  );
}
