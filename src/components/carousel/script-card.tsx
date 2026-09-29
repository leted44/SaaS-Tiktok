"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveScriptEdits } from "@/server/actions/projects";

export interface CarouselScript {
  id: string;
  title: string;
  hook: string;
  scenes: { id: string; text: string; visualDescription: string; brollQuery: string; onScreenText: string | null }[];
  callToAction: string;
  hashtags: string[];
}

/**
 * The project's script, readable and editable from the carousel.
 *
 * The carousel is written from this script, so correcting it here — before the
 * first creation, or before a rewrite — is how the slides come out right. A
 * save is a new script version, exactly as in the video studio, so the video
 * of the same project follows too and nothing is lost.
 */
export function ScriptCard({ script, label, hint }: { script: CarouselScript; label: string; hint?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hook, setHook] = useState(script.hook);
  const [scenes, setScenes] = useState(script.scenes.map((s) => s.text));
  const [callToAction, setCallToAction] = useState(script.callToAction);

  function cancel() {
    setHook(script.hook);
    setScenes(script.scenes.map((s) => s.text));
    setCallToAction(script.callToAction);
    setEditing(false);
  }

  async function save() {
    if (!hook.trim() || scenes.some((t) => !t.trim())) return toast.error("L'accroche et chaque scène doivent contenir du texte.");
    setSaving(true);
    const res = await saveScriptEdits(script.id, {
      title: script.title,
      hook: hook.trim(),
      callToAction: callToAction.trim(),
      hashtags: script.hashtags,
      scenes: script.scenes.map((s, i) => ({ ...s, text: scenes[i].trim() })),
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Script enregistré (version ${res.data.version}).`);
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Modifier
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-brand-300">Accroche</Label>
            <Textarea value={hook} maxLength={600} rows={2} onChange={(e) => setHook(e.target.value)} />
          </div>
          {scenes.map((text, i) => (
            <div key={script.scenes[i].id} className="space-y-1">
              <Label className="text-[11px]">Scène {i + 1}</Label>
              <Textarea value={text} rows={3} onChange={(e) => setScenes((prev) => prev.map((t, k) => (k === i ? e.target.value : t)))} />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-[11px] text-brand-300">Appel à l'action</Label>
            <Textarea value={callToAction} maxLength={400} rows={2} onChange={(e) => setCallToAction(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>Annuler</Button>
            <Button variant="gradient" size="sm" onClick={save} loading={saving}>Enregistrer</Button>
          </div>
        </div>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto text-sm">
          <p><span className="font-semibold text-brand-300">Accroche · </span>{script.hook}</p>
          {script.scenes.map((s, i) => (
            <p key={s.id} className="text-muted-foreground"><span className="font-medium text-foreground">{i + 1}. </span>{s.text}</p>
          ))}
          <p><span className="font-semibold text-brand-300">Appel à l'action · </span>{script.callToAction}</p>
        </div>
      )}
      {hint && !editing && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
