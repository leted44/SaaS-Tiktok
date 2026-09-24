import Link from "next/link";
import { ArrowRight, Bot, CalendarClock, Coins, Film, FolderKanban, GalleryHorizontalEnd, Lock, Mic2, Send, Sparkles, Trophy } from "lucide-react";
import type { DashboardData } from "@/app/(app)/dashboard/data";
import { Poster } from "@/components/dashboard/poster";
import { LocalTime } from "@/components/dashboard/local-time";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { cn, formatNumber } from "@/lib/utils";

export function reveal(i: number): { className: string; style: React.CSSProperties } {
  return {
    className: "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 motion-safe:fill-mode-both",
    style: { animationDelay: `${i * 70}ms` },
  };
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** The counts the app already keeps: projects, scripts, finished renders, publications. */
export function StatGrid({ totals }: { totals: DashboardData["totals"] }) {
  const tiles = [
    { icon: FolderKanban, label: "Projets", value: totals.projects, href: "/projects" },
    { icon: Sparkles, label: "Scripts", value: totals.scripts, href: "/scripts" },
    { icon: Film, label: "Vidéos rendues", value: totals.renders, href: "/exports" },
    { icon: Send, label: "Vidéos publiées", value: totals.published, href: "/projects?vue=posted" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 ring-focus transition hover:border-white/15 sm:px-4 sm:py-4">
          <t.icon className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
          <span className="min-w-0">
            <span className="block font-display text-xl font-bold tabular-nums leading-tight sm:text-2xl">{formatNumber(t.value)}</span>
            <span className="block truncate text-[11px] text-muted-foreground sm:text-xs">{t.label}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Real capabilities only, each opening where it lives. */
export function CreateCards({ data }: { data: DashboardData }) {
  const cards = [
    {
      icon: GalleryHorizontalEnd,
      title: "Carrousel Instagram",
      body: data.carouselSource ? `Des slides avec photos, tirées de « ${data.carouselSource.title} ».` : "Des slides avec photos, tirées d'un de tes scripts.",
      href: data.carouselSource ? `/studio/${data.carouselSource.id}/carousel` : "#quick-create",
      cta: data.carouselSource ? "Ouvrir le carrousel" : "Écrire d'abord un script",
      badge: null as string | null,
      disabled: false,
    },
    {
      icon: Bot,
      title: "Pilote automatique",
      body: data.plan.autopilot ? (data.autopilotQueued > 0 ? `${data.autopilotQueued} vidéo${data.autopilotQueued > 1 ? "s" : ""} en file, produites et livrées à l'heure.` : "Programme tes thèmes : les vidéos se font et te sont livrées à l'heure.") : "Programme tes thèmes : les vidéos se font et te sont livrées à l'heure.",
      href: "/autopilot",
      cta: data.plan.autopilot ? "Programmer" : "Voir l'offre",
      badge: data.plan.autopilot ? null : "Pro",
      disabled: false,
    },
    { icon: Mic2, title: "Voix off", body: data.plan.voiceCloning ? "Voix IA par langue, et ta propre voix clonée." : "Voix IA par langue, écoutables avant de choisir.", href: "/voices", cta: "Écouter les voix", badge: null, disabled: false },
  ];
  return (
    <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
      {cards.map((c) => (
        <Link key={c.title} href={c.href} className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 ring-focus transition hover:border-white/15 sm:p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]"><c.icon className="h-4 w-4 text-brand-200" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-medium">
              {c.title}
              {c.badge && <span className="inline-flex items-center gap-0.5 rounded-full border border-white/10 px-1.5 text-[10px] text-muted-foreground"><Lock className="h-2.5 w-2.5" /> {c.badge}</span>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{c.body}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      ))}
    </div>
  );
}

/** Scheduled publications and autopilot deliveries, soonest first. */
export function Agenda({ entries }: { entries: DashboardData["agenda"] }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-brand-300" /> À venir</p>
      {entries.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Rien de programmé. <Link href="/exports" className="text-foreground underline-offset-4 hover:underline">Programmer une publication</Link> ou{" "}
          <Link href="/autopilot" className="text-foreground underline-offset-4 hover:underline">laisser le pilote automatique produire</Link>.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`}>
              <Link href={e.href} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-muted-foreground">
                  {e.kind === "post" && e.platform ? <PlatformIcon platform={e.platform} /> : <Bot className="h-4 w-4 text-brand-300" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground"><LocalTime iso={e.at.toISOString()} /> · {e.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CreditsCard({ data }: { data: DashboardData }) {
  const pct = Math.min(100, Math.round((data.user.credits / Math.max(1, data.plan.monthlyCredits)) * 100));
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold"><Coins className="h-4 w-4 text-brand-300" /> Crédits</p>
        <Link href="/billing" className="text-[11px] text-muted-foreground transition hover:text-foreground">{data.user.admin ? "Compte interne" : `Forfait ${data.plan.name}`}</Link>
      </div>
      {data.user.admin ? (
        <p className="mt-3 text-xs text-muted-foreground">Générations illimitées sur ce compte : rien n'est débité.</p>
      ) : (
        <>
          <p className="mt-3 font-display text-3xl font-bold tabular-nums">{formatNumber(data.user.credits)}<span className="ml-1 text-sm font-medium text-muted-foreground">/ {formatNumber(data.plan.monthlyCredits)}</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className={cn("h-full rounded-full", pct < 20 ? "bg-amber-400" : "bg-brand-gradient")} style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-[11px] text-muted-foreground">Environ {data.credits.videosLeft} vidéo{data.credits.videosLeft > 1 ? "s" : ""} complète{data.credits.videosLeft > 1 ? "s" : ""} restante{data.credits.videosLeft > 1 ? "s" : ""}.</p>
        </>
      )}
    </div>
  );
}

/** Average and best virality across the account's own scripts. */
export function ScoreSummary({ scores }: { scores: NonNullable<DashboardData["scores"]> }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-violet-500/[0.08] via-transparent to-orange-400/[0.06] p-4 sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient"><Trophy className="h-4 w-4 text-white" /></span>
      <div className="min-w-0 flex-1 text-sm">
        <p>
          Viralité moyenne <b className="font-display tabular-nums">{scores.average}</b>
          <span className="text-muted-foreground"> sur {scores.count} script{scores.count > 1 ? "s" : ""}</span>
        </p>
        {scores.best && (
          <p className="truncate text-xs text-muted-foreground">
            Record : <b className="text-foreground">{scores.best.viralityScore}</b> —{" "}
            <Link href={`/studio/${scores.best.projectId}`} className="underline-offset-4 hover:text-foreground hover:underline">{scores.best.title}</Link>
          </p>
        )}
      </div>
    </div>
  );
}

/** Covers of the latest projects, fanned out — the hero's visual on large screens. */
export function HeroPosters({ posters }: { posters: DashboardData["posters"] }) {
  if (posters.length === 0) return null;
  // Position and tilt live on the outer box, the float on the inner one: both are transforms.
  const layout = [
    ["left-[2%] top-[14%] -rotate-[9deg]", "[animation-delay:-2s]"],
    ["left-[calc(50%-75px)] top-[4%] z-10", ""],
    ["right-[2%] top-[16%] rotate-[9deg]", "[animation-delay:-4s]"],
  ];
  const ordered = posters.length === 1 ? [null, posters[0], null] : posters.length === 2 ? [posters[1], posters[0], null] : [posters[1], posters[0], posters[2]];
  return (
    <div aria-hidden className="relative h-[330px] w-full">
      {ordered.map((p, i) =>
        p ? (
          <div key={p.id} className={cn("absolute w-[150px]", layout[i][0])}>
            <div className={cn("motion-safe:animate-float", layout[i][1])}>
            <Poster id={p.id} title={p.title} thumbnailUrl={p.thumbnailUrl} showTitle className="aspect-[9/16] rounded-2xl border border-white/15 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9),0_0_40px_-10px_rgba(168,85,247,0.45)]">
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </Poster>
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}
