"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Captions, Clapperboard, Copy, FileText, FlaskConical, Layers, MoreHorizontal, Music2, Mic2, Pencil, Plus, Star, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteTemplateAction, duplicateTemplateAction, setDefaultTemplateAction, testTemplateAction } from "@/server/actions/autopilot";
import { describeTemplate, templateCost, type Resolution, type TemplateInput } from "@/lib/autopilot/template-shared";
import { cn } from "@/lib/utils";

export interface TemplateView {
  id: string;
  name: string;
  isDefault: boolean;
  input: TemplateInput;
  /** Videos in the queue made with it, started or not. */
  queued: number;
  /** Of those, the ones not started yet — they move to another template if this one is deleted. */
  waiting: number;
}

interface Props {
  templates: TemplateView[];
  highlight: string | null;
  customVoiceName: string | null;
  recentProjects: { id: string; title: string }[];
  plan: { maxResolution: Resolution; free: boolean };
  queueFull: boolean;
}

/** Every setting of a template, one line each: what a video made with it will be. */
export function TemplateFacts({ input, customVoiceName, className }: { input: TemplateInput; customVoiceName: string | null; className?: string }) {
  const s = describeTemplate(input, customVoiceName);
  const rows = [
    [FileText, s.content],
    [Mic2, s.voice],
    [Captions, s.captions],
    [Music2, s.music],
    [Layers, s.visuals],
    [Clapperboard, s.format],
  ] as const;
  return (
    <ul className={cn("space-y-1 text-[12px]", className)}>
      {rows.map(([Icon, text], i) => (
        <li key={i} className="flex gap-2">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">{text}</span>
        </li>
      ))}
    </ul>
  );
}

export function TemplatesCard({ templates, highlight, customVoiceName, recentProjects, plan, queueFull }: Props) {
  return (
    <section className="surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-brand-200">1</span>
          Modèles de vidéo
        </h2>
        {templates.length > 0 && (
          <Button asChild variant="secondary" size="sm"><Link href="/autopilot/templates/new"><Plus /> Nouveau</Link></Button>
        )}
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-4 text-center">
          <Wand2 className="mx-auto h-6 w-6 text-brand-300" />
          <p className="mt-2 text-sm font-semibold">Crée ton premier modèle</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            Un modèle enregistre tout ce que tu règles dans le studio : voix, sous-titres, musique, visuels, format. Chaque vidéo programmée est produite exactement ainsi.
          </p>
          <Button asChild variant="gradient" size="sm" className="mt-3"><Link href="/autopilot/templates/new"><Wand2 /> Créer un modèle</Link></Button>
          {recentProjects.length > 0 && (
            <div className="mt-4 space-y-1.5 text-left">
              <p className="text-[11px] text-muted-foreground">Ou reprends les réglages d'une vidéo que tu as déjà faite :</p>
              {recentProjects.map((p) => (
                <Link key={p.id} href={`/autopilot/templates/new?from=${p.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs transition hover:border-white/25">
                  <span className="truncate">{p.title}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateRow key={t.id} template={t} highlighted={t.id === highlight} customVoiceName={customVoiceName} plan={plan} queueFull={queueFull} />
          ))}
        </div>
      )}
    </section>
  );
}

function TemplateRow({ template, highlighted, customVoiceName, plan, queueFull }: { template: TemplateView; highlighted: boolean; customVoiceName: string | null; plan: Props["plan"]; queueFull: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [testing, setTesting] = useState(false);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState<null | "test" | "default" | "duplicate" | "delete">(null);
  const cost = templateCost(template.input, plan.maxResolution);

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  async function runTest(e: React.FormEvent) {
    e.preventDefault();
    setBusy("test");
    const res = await testTemplateAction({ templateId: template.id, topic });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success("Test lancé : la vidéo complète arrive dans environ 5 minutes.");
    setTesting(false);
    setTopic("");
    router.push(`/autopilot?item=${res.data.id}`);
    router.refresh();
  }

  async function makeDefault() {
    setBusy("default");
    const res = await setDefaultTemplateAction(template.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  async function duplicate() {
    setBusy("duplicate");
    const res = await duplicateTemplateAction(template.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    router.push(`/autopilot/templates/${res.data.id}`);
  }

  async function remove() {
    const n = template.waiting;
    const moving = n > 0 ? `\n\n${n} vidéo${n > 1 ? "s" : ""} pas encore commencée${n > 1 ? "s" : ""} passera${n > 1 ? "ont" : ""} à un autre modèle (celles déjà en production gardent leurs réglages).` : "";
    if (!window.confirm(`Supprimer le modèle « ${template.name} » ?${moving}`)) return;
    setBusy("delete");
    const res = await deleteTemplateAction(template.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.data.moved > 0 && res.data.movedTo ? `Modèle supprimé. ${res.data.moved} vidéo${res.data.moved > 1 ? "s passent" : " passe"} au modèle « ${res.data.movedTo} ».` : "Modèle supprimé.");
    router.refresh();
  }

  return (
    <div ref={ref} className={cn("rounded-xl border border-white/10 bg-white/[0.02] p-3 transition", highlighted && "ring-2 ring-primary/60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 font-medium">
            <span className="truncate">{template.name}</span>
            {template.isDefault && <Badge variant="default" className="px-1.5 py-0 text-[9px]">Par défaut</Badge>}
          </p>
          {template.queued > 0 && <p className="text-[11px] text-muted-foreground">{template.queued} vidéo{template.queued > 1 ? "s" : ""} en file avec ce modèle</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Plus d'actions" disabled={busy !== null}><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!template.isDefault && <DropdownMenuItem onSelect={makeDefault}><Star /> Définir par défaut</DropdownMenuItem>}
            <DropdownMenuItem onSelect={duplicate}><Copy /> Dupliquer</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={remove} className="text-red-300 focus:text-red-200"><Trash2 /> Supprimer</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TemplateFacts input={template.input} customVoiceName={customVoiceName} className="mt-2" />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button asChild variant="secondary" size="sm"><Link href={`/autopilot/templates/${template.id}`}><Pencil /> Modifier</Link></Button>
        <Button variant={testing ? "outline" : "secondary"} size="sm" disabled={queueFull && !testing} onClick={() => setTesting((v) => !v)}><FlaskConical /> Tester</Button>
      </div>

      {testing && (
        <form onSubmit={runTest} className="mt-3 space-y-2 rounded-lg border border-white/10 p-3">
          <Input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={1200} placeholder="Thème de la vidéo test, ex. : 3 astuces pour mieux dormir" />
          <Button type="submit" variant="gradient" size="sm" className="w-full" loading={busy === "test"} disabled={topic.trim().length < 3}>Produire la vidéo test</Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Une vraie vidéo, faite de bout en bout avec ce modèle — script, voix, visuels, montage, notification — et livrée dans environ 5 minutes.{plan.free ? "" : ` ≈ ${cost} crédits.`}
          </p>
        </form>
      )}
    </div>
  );
}
