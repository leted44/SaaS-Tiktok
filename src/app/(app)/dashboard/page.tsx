import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Captions, ChevronRight, Film, FileText, Layers, Mic2 } from "lucide-react";
import { getDashboard, type DashboardData } from "@/app/(app)/dashboard/data";
import { UpgradePrompt } from "@/components/shared/upgrade-prompt";
import { QuickCreate } from "@/components/dashboard/quick-create";
import { FeaturedProject, FirstProject } from "@/components/dashboard/featured-project";
import { ProjectCard } from "@/components/dashboard/project-card";
import { Agenda, CreateCards, CreditsCard, HeroPosters, ScoreSummary, SectionTitle, StatGrid, reveal } from "@/components/dashboard/sections";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

const PIPELINE = [
  { icon: FileText, label: "Script IA" },
  { icon: Mic2, label: "Voix off" },
  { icon: Layers, label: "Visuels" },
  { icon: Captions, label: "Sous-titres animés" },
  { icon: Film, label: "Export 9:16" },
];

/** The single most useful thing to do now, from the real state of the account. */
function nextAction(d: DashboardData): { text: string; href: string; tone: "alert" | "normal" } | null {
  if (d.autopilotFailed > 0) return { text: `${d.autopilotFailed} vidéo${d.autopilotFailed > 1 ? "s" : ""} du pilote automatique à corriger`, href: "/autopilot", tone: "alert" };
  if (!d.user.admin && d.user.credits < d.credits.scriptCost) return { text: "Plus assez de crédits pour un script : recharger", href: "/billing", tone: "alert" };
  const f = d.featured;
  if (!f) return null;
  if (f.rendering) return { text: `Rendu en cours — « ${f.title} » à ${f.rendering.progress} %`, href: `/studio/${f.id}`, tone: "normal" };
  return { text: `${f.next.label} — « ${f.title} »`, href: f.next.href, tone: "normal" };
}

export default async function DashboardPage() {
  const d = await getDashboard();
  const action = nextAction(d);
  const returning = d.totals.projects > 0;
  const name = d.user.firstName;

  return (
    <div className="mx-auto max-w-[1440px] space-y-10 sm:space-y-14">
      {/* ── Hero + quick create */}
      <section className="relative isolate -mx-4 -mt-6 overflow-hidden px-4 pb-2 pt-8 sm:pt-12 md:-mx-8 md:px-8">
        {/* Glow faded out on every side, so it never ends on a visible edge on wide screens. */}
        <div aria-hidden className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]">
          <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_50%,transparent)]">
            <div className="absolute -top-40 left-[5%] h-[520px] w-[520px] rounded-full bg-violet-700/30 blur-[120px]" />
            <div className="absolute -top-24 right-[5%] h-[420px] w-[420px] rounded-full bg-fuchsia-600/20 blur-[120px]" />
            <div className="absolute bottom-[-30%] left-1/3 h-[380px] w-[380px] rounded-full bg-orange-500/10 blur-[120px]" />
            <div className="dot-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            <p style={reveal(0).style} className={cn("inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur", reveal(0).className)}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-fuchsia-400 to-orange-300" />
              <span className="truncate">{d.workspace.name} · {d.user.admin ? "Compte interne" : `Forfait ${d.plan.name}`}</span>
            </p>
            <h1 style={reveal(1).style} className={cn("mt-4 font-display text-[1.7rem] font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl", reveal(1).className)}>
              {returning ? "Bon retour" : "Bienvenue"}{name ? `, ${name}` : ""}.
              <span className="mt-1 block bg-gradient-to-r from-violet-300 via-fuchsia-300 to-orange-200 bg-clip-text text-transparent">Qu'est-ce qu'on crée aujourd'hui ?</span>
            </h1>
            <p style={reveal(2).style} className={cn("mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base", reveal(2).className)}>
              Une idée suffit : ClipForge écrit le script, pose la voix, choisit les visuels et anime les sous-titres. Tu gardes la main sur chaque étape, jusqu'à l'export.
            </p>

            <ol style={reveal(3).style} className={cn("-mx-4 mt-5 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden", reveal(3).className)} aria-label="Ce que ClipForge fait pour toi">
              {PIPELINE.map((s, i) => (
                <li key={s.label} className="flex shrink-0 items-center gap-1.5">
                  {i > 0 && <ChevronRight aria-hidden className="h-3 w-3 text-muted-foreground/50" />}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-foreground/85">
                    <s.icon className="h-3 w-3 text-brand-300" /> {s.label}
                  </span>
                </li>
              ))}
            </ol>

            {action && (
              <Link
                href={action.href}
                style={reveal(4).style}
                className={cn(
                  "group mt-5 flex max-w-xl items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm transition",
                  action.tone === "alert" ? "border-amber-400/30 bg-amber-400/10 text-amber-100 hover:border-amber-400/50" : "border-white/10 bg-white/[0.035] hover:border-violet-400/40 hover:bg-violet-500/[0.07]",
                  reveal(4).className,
                )}
              >
                <span className="relative flex h-2 w-2 shrink-0"><span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping", action.tone === "alert" ? "bg-amber-400" : "bg-fuchsia-400")} /><span className={cn("relative inline-flex h-2 w-2 rounded-full", action.tone === "alert" ? "bg-amber-400" : "bg-fuchsia-400")} /></span>
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ensuite</span>
                <span className="min-w-0 flex-1 truncate">{action.text}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            )}

            <div style={reveal(5).style} className={cn("mt-6 max-w-3xl", reveal(5).className)}>
              <QuickCreate aiConfigured={d.ai} credits={d.user.credits} cost={d.credits.scriptCost} language={d.workspace.language} />
            </div>
          </div>

          <div className="hidden xl:block" style={reveal(4).style}>
            <HeroPosters posters={d.posters} />
          </div>
        </div>
      </section>

      {d.credits.low && (
        <UpgradePrompt title={d.user.credits === 0 ? "Vous n'avez plus de crédits" : "Crédits bientôt épuisés"} body={`Il vous en reste ${d.user.credits}. Une vidéo complète coûte environ 15 crédits.`} compact />
      )}

      {/* ── Pick up where you left off */}
      <section>{d.featured ? <FeaturedProject project={d.featured} /> : <FirstProject />}</section>

      {/* ── Recent projects */}
      {d.recent.length > 0 && (
        <section>
          <SectionTitle
            title="Projets récents"
            hint="Reprends une vidéo là où tu l'as laissée."
            action={<Link href="/projects" className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">Tout voir <ArrowRight className="h-3.5 w-3.5" /></Link>}
          />
          <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 md:grid-cols-4 xl:grid-cols-6 [&::-webkit-scrollbar]:hidden">
            {d.recent.slice(0, 6).map((p, i) => <ProjectCard key={p.id} project={p} style={{ animationDelay: `${i * 60}ms` }} />)}
          </div>
        </section>
      )}

      {/* ── Numbers (once there is something to count) */}
      {returning && (
        <section>
          <SectionTitle title="Ton studio en chiffres" />
          <StatGrid totals={d.totals} />
          {d.scores && <div className="mt-3 sm:mt-4"><ScoreSummary scores={d.scores} /></div>}
        </section>
      )}

      {/* ── What else, and what's next */}
      <section className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="min-w-0">
          <SectionTitle title="Ce que tu peux créer" hint="Tout ce que le studio sait faire, à un clic." />
          <CreateCards data={d} />
        </div>
        <div className="min-w-0 space-y-4 lg:pt-[52px]">
          <Agenda entries={d.agenda} />
          <CreditsCard data={d} />
        </div>
      </section>
    </div>
  );
}
