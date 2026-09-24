"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Circle, Clock, Flame, FolderCog, GalleryHorizontalEnd, MoreHorizontal, Search, Send, Trash2, Undo2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Poster } from "@/components/dashboard/poster";
import { WorkflowBar } from "@/components/dashboard/workflow";
import { MarkPostedDialog } from "@/components/projects/mark-posted-dialog";
import { SpaceManagerDialog } from "@/components/projects/space-manager-dialog";
import { deleteProject, unmarkProjectPosted } from "@/server/actions/projects";
import { setProjectSpaceAction } from "@/server/actions/spaces";
import { POST_PLATFORM_LABELS, type PostPlatform, type ProjectCardData, type ProjectStage } from "@/lib/projects/progress";
import type { SpaceOption } from "@/lib/spaces";
import { cn, relativeTime } from "@/lib/utils";

type View = ProjectStage | "all";
const ALL_SPACES = "__all__";
const NO_SPACE = "__none__";

const VIEWS: { key: View; label: string; icon: typeof Wrench; empty: string }[] = [
  { key: "todo", label: "À terminer", icon: Wrench, empty: "Rien en cours : toutes tes vidéos sont rendues." },
  { key: "ready", label: "Prêtes à publier", icon: Send, empty: "Aucune vidéo rendue en attente de publication." },
  { key: "posted", label: "Publiées", icon: CheckCircle2, empty: "Aucune vidéo marquée comme publiée. Sur une vidéo prête, touche « Marquer publiée »." },
  { key: "all", label: "Toutes", icon: GalleryHorizontalEnd, empty: "Aucun projet." },
];

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

function platformsText(platforms: string[]): string {
  return platforms.map((p) => POST_PLATFORM_LABELS[p as PostPlatform] ?? p).join(", ");
}

/**
 * The projects, sorted by what they need: finishing, publishing, or nothing
 * (already out). On top of that, an optional space (brand/theme) keeps
 * accounts juggling several Instagram pages or niches from seeing them all
 * mixed together.
 */
export function ProjectsBoard({ projects, initialView, spaces, voices }: { projects: ProjectCardData[]; initialView: View | null; spaces: SpaceOption[]; voices: { id: string; name: string }[] }) {
  const counts = useMemo(() => ({
    todo: projects.filter((p) => p.stage === "todo").length,
    ready: projects.filter((p) => p.stage === "ready").length,
    posted: projects.filter((p) => p.stage === "posted").length,
    all: projects.length,
  }), [projects]);
  const [view, setView] = useState<View>(initialView ?? (counts.todo ? "todo" : counts.ready ? "ready" : counts.posted ? "posted" : "todo"));
  const [spaceFilter, setSpaceFilter] = useState<string>(ALL_SPACES);
  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState(false);

  function pick(v: View) {
    setView(v);
    // Keep the choice in the address, so going back to the page lands on the same list.
    const url = new URL(window.location.href);
    url.searchParams.set("vue", v);
    window.history.replaceState(null, "", url);
  }

  const q = query.trim().toLowerCase();
  const shown = projects
    .filter((p) => view === "all" || p.stage === view)
    .filter((p) => spaceFilter === ALL_SPACES || (spaceFilter === NO_SPACE ? !p.space : p.space?.id === spaceFilter))
    .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.topic ?? "").toLowerCase().includes(q));
  const current = VIEWS.find((v) => v.key === view)!;
  const untaggedCount = projects.filter((p) => !p.space).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" aria-label="Filtrer les projets" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              onClick={() => pick(v.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
                view === v.key ? "border-primary/50 bg-primary/15 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
              )}
            >
              <v.icon className="h-3.5 w-3.5" /> {v.label}
              <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", view === v.key ? "bg-white/15" : "bg-white/[0.06]")}>{counts[v.key]}</span>
            </button>
          ))}
        </div>
        <label className="relative block md:w-64">
          <span className="sr-only">Rechercher</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un projet" className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-white/25" />
        </label>
      </div>

      {spaces.length > 0 ? (
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          <button onClick={() => setSpaceFilter(ALL_SPACES)} className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs transition", spaceFilter === ALL_SPACES ? "border-white/25 bg-white/10 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20")}>
            Tous les espaces
          </button>
          {spaces.map((s) => (
            <button key={s.id} onClick={() => setSpaceFilter(s.id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition", spaceFilter === s.id ? "border-white/25 bg-white/10 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20")}>
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.name}
            </button>
          ))}
          {untaggedCount > 0 && (
            <button onClick={() => setSpaceFilter(NO_SPACE)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition", spaceFilter === NO_SPACE ? "border-white/25 bg-white/10 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20")}>
              <Circle className="h-2.5 w-2.5" /> Sans espace
            </button>
          )}
          <button onClick={() => setManaging(true)} className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground transition hover:text-foreground">
            <FolderCog className="h-3.5 w-3.5" /> Gérer
          </button>
        </div>
      ) : (
        <button onClick={() => setManaging(true)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground">
          <FolderCog className="h-3.5 w-3.5" /> Plusieurs marques ou thèmes ? Crée des espaces pour les séparer.
        </button>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">{q ? `Aucun projet ne correspond à « ${query.trim()} ».` : current.empty}</p>
      ) : (
        <ul className="grid gap-2.5 lg:grid-cols-2">
          {shown.map((p) => <ProjectRow key={p.id} project={p} showStage={view === "all"} spaces={spaces} />)}
        </ul>
      )}

      <SpaceManagerDialog spaces={spaces} voices={voices} open={managing} onOpenChange={setManaging} />
    </div>
  );
}

function ProjectRow({ project: p, showStage, spaces }: { project: ProjectCardData; showStage: boolean; spaces: SpaceOption[] }) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);
  const [busy, setBusy] = useState(false);
  const studio = `/studio/${p.id}`;

  async function remove() {
    if (!confirm(`Supprimer « ${p.title} » ? Cela supprime aussi les scripts, voix off et rendus.`)) return;
    setBusy(true);
    const res = await deleteProject(p.id);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Projet supprimé");
    router.refresh();
  }

  async function unmark() {
    setBusy(true);
    const res = await unmarkProjectPosted(p.id);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Marque « publiée » retirée.");
    router.refresh();
  }

  async function assignSpace(spaceId: string | null) {
    setBusy(true);
    const res = await setProjectSpaceAction(p.id, spaceId);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  return (
    <li className={cn("group flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2.5 transition hover:border-white/15 sm:gap-4 sm:p-3", busy && "opacity-50")}>
      <Link href={p.stage === "todo" ? p.next.href : studio} className="shrink-0" aria-label={`Ouvrir « ${p.title} »`}>
        <Poster id={p.id} title={p.title} thumbnailUrl={p.thumbnailUrl} className="aspect-[9/16] w-[62px] rounded-xl border border-white/[0.08] sm:w-[72px]">
          {p.stage === "posted" && <span className="absolute inset-x-0 bottom-0 flex justify-center bg-emerald-500/85 py-0.5"><CheckCircle2 className="h-3 w-3 text-white" /></span>}
        </Poster>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
          <Link href={studio} className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold leading-snug transition group-hover:text-brand-100">{p.title}</p>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1 -mt-1 shrink-0" aria-label="Plus d'actions" disabled={busy}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><Link href={studio}>Ouvrir dans le studio</Link></DropdownMenuItem>
              {p.hasScript && <DropdownMenuItem asChild><Link href={`${studio}/carousel`}><GalleryHorizontalEnd /> Carrousel</Link></DropdownMenuItem>}
              {spaces.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><FolderCog /> Espace</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {spaces.map((s) => (
                      <DropdownMenuItem key={s.id} onSelect={() => assignSpace(s.id)}>
                        <span className="flex h-3 w-3 items-center justify-center rounded-full" style={{ background: s.color }}>{p.space?.id === s.id && <CheckCircle2 className="h-3 w-3 text-white" />}</span>
                        {s.name}
                      </DropdownMenuItem>
                    ))}
                    {p.space && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => assignSpace(null)}>Aucun espace</DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              {p.posted?.manual ? (
                <DropdownMenuItem onSelect={unmark}><Undo2 /> Retirer « publiée »</DropdownMenuItem>
              ) : !p.posted ? (
                <DropdownMenuItem onSelect={() => setMarking(true)}><CheckCircle2 /> Marquer publiée</DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={remove} className="text-red-300 focus:text-red-200"><Trash2 /> Supprimer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {p.space && (
            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.space.color }} /> {p.space.name}
            </span>
          )}
          {showStage && <span className="font-medium text-foreground/80">{p.stage === "todo" ? "À terminer" : p.stage === "ready" ? "Prête" : "Publiée"}</span>}
          {p.duration && <span>{p.duration}</span>}
          {p.scores && <span className="inline-flex items-center gap-0.5"><Flame className="h-3 w-3" />{p.scores.virality}</span>}
          {p.episode && <span>Épisode {p.episode.number}/{p.episode.total}</span>}
          <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" />{relativeTime(p.updatedAt)}</span>
        </p>

        <div className="mt-auto pt-2">
          {p.stage === "todo" && (
            <div className="space-y-1.5">
              <WorkflowBar steps={p.steps} />
              <Link href={p.next.href} className="inline-flex items-center gap-1 text-xs font-medium text-brand-200 transition hover:text-brand-100">
                {p.rendering ? `Rendu en cours · ${p.rendering.progress} %` : p.next.label} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
          {p.stage === "ready" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="gradient" className="h-8" onClick={() => setMarking(true)}><CheckCircle2 /> Marquer publiée</Button>
              <Link href="/exports" className="text-xs text-muted-foreground transition hover:text-foreground">Publier ou télécharger</Link>
            </div>
          )}
          {p.stage === "posted" && p.posted && (
            <p className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                Publiée{p.posted.at ? ` le ${dateFmt.format(new Date(p.posted.at))}` : ""}{p.posted.platforms.length ? ` · ${platformsText(p.posted.platforms)}` : ""}
              </span>
            </p>
          )}
        </div>
      </div>

      {marking && <MarkPostedDialog projectId={p.id} title={p.title} open={marking} onOpenChange={setMarking} />}
    </li>
  );
}
