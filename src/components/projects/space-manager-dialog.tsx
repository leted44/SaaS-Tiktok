"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Palette, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveSpaceAction, deleteSpaceAction } from "@/server/actions/spaces";
import { SPACE_COLORS, type SpaceOption } from "@/lib/spaces";
import { TONES, TONE_LABELS } from "@/lib/autopilot/template-shared";
import { LANGUAGE_LABELS } from "@/lib/tts/voices";
import { cn } from "@/lib/utils";

const CONTENT_LANGUAGES = ["fr", "en", "es", "de", "it", "pt"];
/** Sentinel for "use the brand kit's default" — Radix Select rejects an empty string value. */
const DEFAULT = "__default__";

interface VoiceOption {
  id: string;
  name: string;
}

interface FormState {
  name: string;
  color: string;
  language: string;
  tone: string;
  voiceId: string;
}

function blank(): FormState {
  return { name: "", color: SPACE_COLORS[0], language: DEFAULT, tone: DEFAULT, voiceId: DEFAULT };
}

function fromSpace(s: SpaceOption): FormState {
  return { name: s.name, color: s.color, language: s.language ?? DEFAULT, tone: s.tone ?? DEFAULT, voiceId: s.voiceId ?? DEFAULT };
}

/**
 * Create, tune or remove spaces — the tag that keeps unrelated projects
 * (different accounts, different themes) from showing up in the same list.
 * Each space can carry its own default voice, ton and langue, prefilled
 * (never forced) whenever a script starts in it.
 */
export function SpaceManagerDialog({ spaces, voices, open, onOpenChange }: { spaces: SpaceOption[]; voices: VoiceOption[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blank());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const editing = editingId !== null;

  function startCreate() {
    setEditingId("new");
    setForm(blank());
  }
  function startEdit(s: SpaceOption) {
    setEditingId(s.id);
    setForm(fromSpace(s));
  }
  function cancel() {
    setEditingId(null);
    setForm(blank());
  }

  async function save() {
    setSaving(true);
    const res = await saveSpaceAction(editingId === "new" ? null : editingId, {
      name: form.name,
      color: form.color,
      language: form.language === DEFAULT ? null : form.language,
      tone: form.tone === DEFAULT ? null : form.tone,
      voiceId: form.voiceId === DEFAULT ? null : form.voiceId,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(editingId === "new" ? "Espace créé." : "Espace enregistré.");
    cancel();
    router.refresh();
  }

  async function remove(s: SpaceOption) {
    const note = s.projectCount > 0 ? `\n\n${s.projectCount} vidéo${s.projectCount > 1 ? "s" : ""} passera${s.projectCount > 1 ? "ont" : ""} en « sans espace ».` : "";
    if (!confirm(`Supprimer l'espace « ${s.name} » ?${note}`)) return;
    setDeletingId(s.id);
    const res = await deleteSpaceAction(s.id);
    setDeletingId(null);
    if (!res.ok) return toast.error(res.error);
    toast.success("Espace supprimé.");
    if (editingId === s.id) cancel();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) cancel(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Espaces</DialogTitle>
          <DialogDescription>Un espace par marque ou thème — chacun peut garder sa propre voix et son propre ton.</DialogDescription>
        </DialogHeader>

        {!editing && (
          <div className="space-y-3">
            {spaces.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-muted-foreground">Aucun espace pour l'instant.</p>
            ) : (
              <ul className="space-y-1.5">
                {spaces.map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] px-3 py-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{s.projectCount} vidéo{s.projectCount > 1 ? "s" : ""}</span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${s.name}`} onClick={() => startEdit(s)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${s.name}`} loading={deletingId === s.id} onClick={() => remove(s)} className="text-red-300 hover:text-red-200"><Trash2 /></Button>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="secondary" className="w-full" onClick={startCreate}><Plus /> Nouvel espace</Button>
          </div>
        )}

        {editing && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="space-name">Nom</Label>
              <Input id="space-name" autoFocus value={form.name} maxLength={40} onChange={(e) => set("name", e.target.value)} placeholder="Ex. : Kali IQ" />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Couleur</Label>
              <div className="flex flex-wrap gap-2">
                {SPACE_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={c} onClick={() => set("color", c)} className="flex h-8 w-8 items-center justify-center rounded-full ring-focus transition" style={{ background: c }}>
                    {form.color === c && <Check className="h-4 w-4 text-white drop-shadow" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.07] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Réglages par défaut de cet espace</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Proposés pour chaque nouveau script dans cet espace — jamais imposés.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Langue</Label>
                  <Select value={form.language} onValueChange={(v) => set("language", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT}>Comme la charte</SelectItem>
                      {CONTENT_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{LANGUAGE_LABELS[l] ?? l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ton</Label>
                  <Select value={form.tone} onValueChange={(v) => set("tone", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT}>Comme la charte</SelectItem>
                      {TONES.map((t) => <SelectItem key={t} value={t}>{TONE_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Voix</Label>
                  <Select value={form.voiceId} onValueChange={(v) => set("voiceId", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT}>Comme la charte</SelectItem>
                      {voices.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className={cn("flex gap-2", editingId !== "new" && "justify-between")}>
              {editingId !== "new" && (
                <Button variant="ghost" className="text-red-300 hover:text-red-200" onClick={() => { const s = spaces.find((x) => x.id === editingId); if (s) void remove(s); }}><Trash2 /> Supprimer</Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" onClick={cancel}>Annuler</Button>
                <Button variant="gradient" loading={saving} disabled={form.name.trim().length === 0} onClick={save}><Save /> Enregistrer</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
