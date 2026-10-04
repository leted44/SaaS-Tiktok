"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Lightbulb, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dismissLessonAction, refreshLessonsAction, updateLessonAction } from "@/server/actions/results";
import { cn } from "@/lib/utils";

export interface LessonView {
  id: string;
  text: string;
  evidence: string;
  confidence: string;
  format: string | null;
  postCount: number;
  pinned: boolean;
}

export interface LessonScope {
  spaceId: string | null;
  name: string;
  color: string;
  results: number;
  lessons: LessonView[];
}

const FORMAT_LABEL: Record<string, string> = { video: "Vidéo", carousel: "Carrousel" };
const CONFIDENCE_STYLE: Record<string, string> = {
  faible: "border-amber-300/25 text-amber-200",
  moyenne: "border-sky-300/25 text-sky-200",
  élevée: "border-emerald-300/25 text-emerald-200",
};

/** One account's lessons, with what they rest on — editable and deletable, since the creator knows their audience best. */
export function LessonsBoard({ scopes }: { scopes: LessonScope[] }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scope = scopes[Math.min(active, scopes.length - 1)];

  async function refresh() {
    setRefreshing(true);
    const res = await refreshLessonsAction(scope.spaceId);
    setRefreshing(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.data.posts < 3 ? "Il faut les résultats d'au moins 3 publications pour tirer des leçons." : `${res.data.lessons} leçon${res.data.lessons > 1 ? "s" : ""} à jour.`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {scopes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {scopes.map((s, i) => (
            <button key={s.spaceId ?? "none"} type="button" onClick={() => setActive(i)} aria-pressed={i === active} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition", i === active ? "border-primary/60 bg-primary/15" : "border-white/10 text-muted-foreground hover:border-white/25")}>
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <p className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-brand-300" /> {scope.results} publication{scope.results > 1 ? "s" : ""} avec résultats</p>
        <Button variant="secondary" size="sm" loading={refreshing} disabled={scope.results < 3} onClick={refresh}>{!refreshing && <RefreshCw />} Recalculer les leçons</Button>
      </div>

      {scope.lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
          <Lightbulb className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">{scope.results < 3 ? "Pas encore assez de résultats" : "Aucune leçon nette pour l'instant"}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            {scope.results < 3
              ? `Ajoute les résultats d'au moins 3 publications (bouton « Résultats » sur une publication marquée publiée) : ${Math.max(0, 3 - scope.results)} de plus. Une seule publication chanceuse ne fait pas une règle.`
              : "Tes publications ne montrent pas encore de différence assez claire. Les leçons apparaîtront avec les prochains résultats."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scope.lessons.map((l) => <LessonCard key={l.id} lesson={l} onChanged={() => router.refresh()} />)}
        </div>
      )}
    </div>
  );
}

function LessonCard({ lesson, onChanged }: { lesson: LessonView; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(lesson.text);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);

  async function save() {
    setBusy("save");
    const res = await updateLessonAction(lesson.id, text);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setEditing(false);
    toast.success("Leçon enregistrée : elle restera telle que tu l'as écrite.");
    onChanged();
  }

  async function remove() {
    setBusy("remove");
    const res = await dismissLessonAction(lesson.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success("Leçon supprimée : elle ne sera plus proposée.");
    onChanged();
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-card p-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted-foreground">{lesson.format ? FORMAT_LABEL[lesson.format] ?? lesson.format : "Vidéo et carrousel"}</span>
        <span className={cn("rounded-full border px-2 py-0.5", CONFIDENCE_STYLE[lesson.confidence] ?? "border-white/10 text-muted-foreground")}>Confiance {lesson.confidence}</span>
        {lesson.postCount > 0 && <span className="text-muted-foreground">· {lesson.postCount} publications</span>}
        {lesson.pinned && <span className="rounded-full border border-brand-400/30 px-2 py-0.5 text-brand-200">Modifiée par toi</span>}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={400} />
          <div className="flex gap-2">
            <Button size="sm" variant="gradient" loading={busy === "save"} onClick={save}>Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(lesson.text); }}>Annuler</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm font-medium leading-relaxed">{lesson.text}</p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">{lesson.evidence}</p>
      {!editing && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}><Pencil /> Modifier</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-300" loading={busy === "remove"} onClick={remove}>{busy !== "remove" && <Trash2 />} Supprimer</Button>
        </div>
      )}
    </div>
  );
}
