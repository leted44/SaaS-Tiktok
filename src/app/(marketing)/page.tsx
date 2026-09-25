import Link from "next/link";
import { ArrowRight, Sparkles, Mic2, Captions, Send, Wand2, Gauge, ShieldCheck, Zap, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { formatCurrency, cn } from "@/lib/utils";
import { HeroPreview } from "@/components/marketing/hero-preview";
import { Reveal } from "@/components/marketing/reveal";

const features = [
  { icon: Sparkles, title: "Générateur de script viral", body: "Tapez un sujet ou collez une URL. Obtenez un hook, des scènes, un CTA et un score de viralité calibré en quelques secondes." },
  { icon: Mic2, title: "Voix off qualité studio", body: "12 voix IA sélectionnées avec horodatage mot par mot pour que chaque sous-titre tombe pile au bon moment." },
  { icon: Captions, title: "Sous-titres dynamiques", body: "Six styles de sous-titres — Hormozi, karaoké, néon, encadré — avec surbrillance mot par mot et aperçu en direct." },
  { icon: Wand2, title: "Studio de montage", body: "Réorganisez les scènes, ajoutez des images avec effet Ken Burns, réglez le mixage musical. Aperçu Remotion en temps réel." },
  { icon: Send, title: "Publiez partout", body: "Un rendu, trois plateformes. Programmez vos publications TikTok, Reels et Shorts depuis une file unique." },
  { icon: Gauge, title: "Des crédits, pas de devinettes", body: "Consommation transparente par script, voix et rendu. Passez au niveau supérieur seulement quand les chiffres le justifient." },
];

const steps = [
  { n: "01", title: "Brief", body: "Décrivez la vidéo. Choisissez la niche, le ton, la durée et le style de hook." },
  { n: "02", title: "Script", body: "L'IA rédige le hook, les scènes et le CTA avec une analyse de viralité. Modifiez tout directement." },
  { n: "03", title: "Voix & sous-titres", body: "Choisissez une voix, prévisualisez-la, générez. Les sous-titres s'alignent automatiquement." },
  { n: "04", title: "Rendu & publication", body: "Rendez en 1080p ou 4K dans le cloud et programmez sur toutes les plateformes." },
];

export default function LandingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="container relative pb-24 pt-20 md:pt-28">
        <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Reveal>
              <Badge variant="gradient" className="mb-6 px-3 py-1 text-xs normal-case tracking-normal">
                <Zap className="h-3 w-3" /> Nouveau · Styles de sous-titres dynamiques & rendus 4K
              </Badge>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
                Publiez un short viral <span className="text-gradient">chaque jour.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                VidiSprint transforme une idée en vidéo scriptée, doublée, sous-titrée et publiée pour TikTok, Reels et Shorts — en moins de cinq minutes, sans ouvrir de logiciel de montage.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="xl" variant="gradient">
                  <Link href="/sign-up">
                    Créer gratuitement <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <Link href="#workflow">Voir le workflow</Link>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">30 crédits offerts · Sans carte bancaire · Annulable à tout moment</p>
            </Reveal>
          </div>
          <Reveal delay={0.2} className="relative">
            <HeroPreview />
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">Tout, entre l'idée et la publication.</h2>
          <p className="mt-4 text-muted-foreground">Un seul espace de travail remplace votre doc de script, votre outil de synthèse vocale, votre appli de sous-titres, votre éditeur et votre planificateur.</p>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.05}>
              <div className="group surface relative h-full overflow-hidden p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-glow-sm">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100" />
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-brand-300">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="border-y border-white/[0.05] bg-white/[0.015] py-24">
        <div className="container">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">Quatre étapes. Cinq minutes.</h2>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.07}>
                <div className="relative">
                  <div className="font-display text-5xl font-bold text-white/[0.06]">{s.n}</div>
                  <h3 className="-mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="container py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">Une tarification qui suit votre production.</h2>
          <p className="mt-4 text-muted-foreground">Les crédits couvrent les scripts, les voix et les rendus. Une vidéo de 45 secondes en 1080p coûte 17 crédits.</p>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PLAN_ORDER.map((id, i) => {
            const plan = PLANS[id];
            return (
              <Reveal key={id} delay={i * 0.05}>
                <div className={cn("surface relative flex h-full flex-col p-6", plan.highlight && "border-primary/50 shadow-glow")}>
                  {plan.highlight && <Badge variant="gradient" className="absolute -top-3 left-6">Le plus populaire</Badge>}
                  <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold">{plan.priceMonthly === 0 ? "Gratuit" : formatCurrency(plan.priceMonthly)}</span>
                    {plan.priceMonthly > 0 && <span className="text-sm text-muted-foreground">/mois</span>}
                  </div>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-6" variant={plan.highlight ? "gradient" : "secondary"}>
                    <Link href="/sign-up">{plan.priceMonthly === 0 ? "Commencer gratuitement" : `Choisir ${plan.name}`}</Link>
                  </Button>
                </div>
              </Reveal>
            );
          })}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Paiement sécurisé par Stripe</span>
          <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4" /> Les crédits achetés en recharge n'expirent jamais</span>
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-brand-gradient p-12 text-center text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
            <h2 className="relative font-display text-3xl font-bold md:text-5xl">Vos 30 prochaines vidéos ne sont qu'à un brief.</h2>
            <p className="relative mx-auto mt-4 max-w-lg text-white/80">Rejoignez les créateurs qui ont remplacé 3 heures de travail par 5 minutes.</p>
            <Button asChild size="xl" className="relative mt-8 bg-white text-brand-800 hover:bg-white/90">
              <Link href="/sign-up">Créer ma première vidéo <ArrowRight /></Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
