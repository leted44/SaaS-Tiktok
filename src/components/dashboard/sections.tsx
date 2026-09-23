import Link from "next/link";
import { ArrowRight, Bot, CalendarClock, Coins, Film, FolderKanban, GalleryHorizontalEnd, Lock, Mic2, Send, Sparkles, Trophy, Wand2 } from "lucide-react";
import type { DashboardData } from "@/app/(app)/dashboard/data";
import { Poster } from "@/components/dashboard/poster";
import { LocalTime } from "@/components/dashboard/local-time";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { UsageChart } from "@/components/dashboard/usage-chart";
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
    { icon: FolderKanban, label: "Projets", value: totals.projects, hint: "depuis le début", href: "/projects" },
    { icon: Sparkles, label: "Scripts générés", value: totals.scripts, hint: "hooks, scènes et CTA", href: "/scripts" },
    { icon: Film, label: "Vidéos rendues", value: totals.renders, hint: "exports terminés", href: "/exports" },
    { icon: Send, label: "Publications", value: totals.published, hint: "toutes plateformes", href: "/exports" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {tiles.map((t, i) => {
        const r = reveal(i + 2);
        return (
          <Link key={t.label} href={t.href} style={r.style} className={cn("group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0e0b18] p-4 shadow-card ring-focus transition duration-300 hover:border-white/15 motion-safe:hover:-translate-y-0.5 sm:p-5", r.className)}>
            <div aria-hidden className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-fuchsia-500/10 blur-2xl transition-opacity duration-500 group-hover:bg-fuchsia-500/25" />
            <div className="relative flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/25 to-fuchsia-500/10"><t.icon className="h-4 w-4 text-brand-200" /></span>
              <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-muted-foreground opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
            </div>
            <p className="relative mt-4 font-display text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">{formatNumber(t.value)}</p>
            <p className="relative mt-1 text-xs font-medium text-foreground/90 sm:text-sm">{t.label}</p>
            <p className="relative hidden text-[11px] text-muted-foreground sm:block">{t.hint}</p>
          </Link>
        );
      })}
    </div>
  );
}

/** Real capabilities only, each opening where it lives. */
export function CreateCards({ data }: { data: DashboardData }) {
  const cards = [
    { icon: Wand2, title: "Vidéo courte IA", body: "Script, voix off, visuels, sous-titres animés et export 9:16.", href: "#quick-create", cta: "Décrire une idée", badge: null as string | null, disabled: false },
    {
      icon: GalleryHorizontalEnd,
      title: "Carrousel Instagram",
      body: data.carouselSource ? `Des slides avec photos, tirées de « ${data.carouselSource.title} ».` : "Des slides avec photos, tirées d'un de tes scripts.",
      href: data.carouselSource ? `/studio/${data.carouselSource.id}/carousel` : "#quick-create",
      cta: data.carouselSource ? "Ouvrir le carrousel" : "Écrire d'abord un script",
      badge: null,
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
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
      {cards.map((c, i) => {
        const r = reveal(i);
        return (
          <Link key={c.title} href={c.href} style={r.style} className={cn("group relative flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.035] to-transparent p-4 ring-focus transition duration-300 hover:border-violet-400/30 motion-safe:hover:-translate-y-0.5 sm:w-auto sm:max-w-none", r.className)}>
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-[0_8px_24px_-8px_rgba(219,39,119,0.7)]"><c.icon className="h-4 w-4 text-white" /></span>
              {c.badge && <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200"><Lock className="h-2.5 w-2.5" /> {c.badge}</span>}
            </div>
            <p className="mt-3 text-sm font-semibold">{c.title}</p>
            <p className="mt-1 line-clamp-2 flex-1 text-xs text-muted-foreground">{c.body}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-200 transition group-hover:text-brand-100">{c.cta} <ArrowRight className="h-3.5 w-3.5 transition-transform motion-safe:group-hover:translate-x-0.5" /></span>
          </Link>
        );
      })}
    </div>
  );
}

/** Scheduled publications and autopilot deliveries, soonest first. */
export function Agenda({ entries }: { entries: DashboardData["agenda"] }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0e0b18] p-4 shadow-card sm:p-5">
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
    <div className="rounded-2xl border border-white/[0.07] bg-[#0e0b18] p-4 shadow-card sm:p-5">
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
      {data.usage.totalUsed > 0 && (
        <>
          <UsageChart usage={data.usage.byType} />
          <p className="mt-3 text-[11px] text-muted-foreground">{data.usage.totalUsed} crédits utilisés sur 30 jours.</p>
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
  const layout = [
    "left-[6%] top-[14%] -rotate-[9deg] motion-safe:animate-float [animation-delay:-2s]",
    "left-1/2 top-[4%] z-10 -translate-x-1/2 motion-safe:animate-float",
    "right-[6%] top-[16%] rotate-[9deg] motion-safe:animate-float [animation-delay:-4s]",
  ];
  const ordered = posters.length === 1 ? [null, posters[0], null] : posters.length === 2 ? [posters[1], posters[0], null] : [posters[1], posters[0], posters[2]];
  return (
    <div aria-hidden className="relative h-[330px] w-full">
      {ordered.map((p, i) =>
        p ? (
          <div key={p.id} className={cn("absolute w-[150px]", layout[i])}>
            <Poster id={p.id} title={p.title} thumbnailUrl={p.thumbnailUrl} showTitle className="aspect-[9/16] rounded-2xl border border-white/15 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9),0_0_40px_-10px_rgba(168,85,247,0.45)]">
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </Poster>
          </div>
        ) : null,
      )}
    </div>
  );
}
