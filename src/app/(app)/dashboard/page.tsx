import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { getDashboard, type DashboardData } from "@/app/(app)/dashboard/data";
import { UpgradePrompt } from "@/components/shared/upgrade-prompt";
import { QuickCreate } from "@/components/dashboard/quick-create";
import { FeaturedProject, FirstProject } from "@/components/dashboard/featured-project";
import { ProjectCard } from "@/components/dashboard/project-card";
import { Agenda, CreateCards, CreditsCard, HeroPosters, SectionTitle, StatGrid, reveal } from "@/components/dashboard/sections";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

/** Something that needs fixing before videos can be made. Nothing is shown when all is well. */
function alertFor(d: DashboardData): { text: string; href: string } | null {
  if (d.autopilotFailed > 0) return { text: `${d.autopilotFailed} vidéo${d.autopilotFailed > 1 ? "s" : ""} du pilote automatique à corriger`, href: "/autopilot" };
  if (!d.user.admin && d.user.credits < d.credits.scriptCost) return { text: "Plus assez de crédits pour écrire un script", href: "/billing" };
  return null;
}

export default async function DashboardPage() {
  const d = await getDashboard();
  const alert = alertFor(d);
  const returning = d.totals.projects > 0;
  const name = d.user.firstName;

  return (
    <div className="mx-auto max-w-[1440px] space-y-10 sm:space-y-14">
      {/* ── Hero + quick create */}
      <section className="relative isolate -mx-4 -mt-6 overflow-hidden px-4 pb-2 pt-8 sm:pt-12 md:-mx-8 md:px-8">
        {/* One soft glow, faded out on every side. */}
        <div aria-hidden className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]">
          <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]">
            <div className="absolute -top-48 left-[10%] h-[480px] w-[480px] rounded-full bg-violet-700/[0.18] blur-[120px]" />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            <h1 style={reveal(0).style} className={cn("font-display text-[1.6rem] font-bold leading-[1.15] tracking-tight sm:text-4xl lg:text-[2.75rem]", reveal(0).className)}>
              {returning ? "Bon retour" : "Bienvenue"}{name ? `, ${name}` : ""}.
              <span className="mt-1 block font-semibold text-muted-foreground">Qu'est-ce qu'on crée aujourd'hui ?</span>
            </h1>

            {alert && (
              <Link href={alert.href} style={reveal(1).style} className={cn("group mt-5 flex max-w-xl items-center gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-sm text-amber-100 transition hover:border-amber-400/45", reveal(1).className)}>
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                <span className="min-w-0 flex-1 truncate">{alert.text}</span>
                <ArrowRight className="h-4 w-4 shrink-0 opacity-60 transition group-hover:translate-x-0.5" />
              </Link>
            )}

            <div style={reveal(2).style} className={cn("mt-6 max-w-3xl", reveal(2).className)}>
              <QuickCreate aiConfigured={d.ai} credits={d.user.credits} cost={d.credits.scriptCost} language={d.workspace.language} />
            </div>
          </div>

          <div className="hidden xl:block" style={reveal(3).style}>
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
          <SectionTitle title="En chiffres" />
          <StatGrid totals={d.totals} />
        </section>
      )}

      {/* ── What else, and what's next */}
      <section className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="min-w-0">
          <SectionTitle title="Aussi dans le studio" />
          <CreateCards data={d} />
        </div>
        <div className="min-w-0 space-y-4 lg:pt-[52px]">
          <Agenda entries={d.agenda} />
          {!d.user.admin && <CreditsCard data={d} />}
        </div>
      </section>
    </div>
  );
}
