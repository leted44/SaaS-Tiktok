import Link from "next/link";
import { ArrowRight, Sparkles, Mic2, Captions, Send, Wand2, Gauge, ShieldCheck, Zap, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { formatCurrency, cn } from "@/lib/utils";
import { HeroPreview } from "@/components/marketing/hero-preview";
import { Reveal } from "@/components/marketing/reveal";

const features = [
  { icon: Sparkles, title: "Viral script engine", body: "Type a topic or paste a URL. Get a hook, scenes, CTA and a calibrated virality score in seconds." },
  { icon: Mic2, title: "Studio-grade voiceovers", body: "12 curated AI voices with word-level timestamps so every caption lands on the beat." },
  { icon: Captions, title: "Kinetic captions", body: "Six caption systems — Hormozi, karaoke, neon, boxed — with word-by-word highlight and live preview." },
  { icon: Wand2, title: "Timeline studio", body: "Rearrange scenes, drop in b-roll with Ken Burns motion, tune music ducking. Real-time Remotion preview." },
  { icon: Send, title: "Publish everywhere", body: "One render, three platforms. Schedule TikTok, Reels and Shorts posts from a single queue." },
  { icon: Gauge, title: "Credits, not guesswork", body: "Transparent usage per script, voice and render. Upgrade only when the numbers say so." },
];

const steps = [
  { n: "01", title: "Brief", body: "Describe the video. Pick niche, tone, duration and hook style." },
  { n: "02", title: "Script", body: "AI drafts hook, scenes and CTA with a virality breakdown. Edit anything inline." },
  { n: "03", title: "Voice & captions", body: "Choose a voice, preview it, generate. Captions align automatically." },
  { n: "04", title: "Render & post", body: "Render 1080p or 4K in the cloud and schedule to every platform." },
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
                <Zap className="h-3 w-3" /> New · Kinetic caption presets & 4K renders
              </Badge>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
                Ship a viral short <span className="text-gradient">every single day.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                ClipForge turns one idea into a scripted, voiced, captioned and published video for TikTok, Reels and Shorts — in under five minutes, without opening an editor.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="xl" variant="gradient">
                  <Link href="/sign-up">
                    Start creating free <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <Link href="#workflow">See the workflow</Link>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">30 free credits · No card required · Cancel anytime</p>
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
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">Everything between idea and upload.</h2>
          <p className="mt-4 text-muted-foreground">One workspace replaces your script doc, TTS tool, caption app, editor and scheduler.</p>
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
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">Four steps. Five minutes.</h2>
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
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">Pricing that scales with output.</h2>
          <p className="mt-4 text-muted-foreground">Credits cover scripts, voices and renders. A typical 45-second video costs about 15 credits.</p>
        </Reveal>
        <div className="mt-14 grid gap-4 lg:grid-cols-4">
          {PLAN_ORDER.map((id, i) => {
            const plan = PLANS[id];
            return (
              <Reveal key={id} delay={i * 0.05}>
                <div className={cn("surface relative flex h-full flex-col p-6", plan.highlight && "border-primary/50 shadow-glow")}>
                  {plan.highlight && <Badge variant="gradient" className="absolute -top-3 left-6">Most popular</Badge>}
                  <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold">{plan.priceMonthly === 0 ? "Free" : formatCurrency(plan.priceMonthly)}</span>
                    {plan.priceMonthly > 0 && <span className="text-sm text-muted-foreground">/month</span>}
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
                    <Link href="/sign-up">{plan.priceMonthly === 0 ? "Start free" : `Get ${plan.name}`}</Link>
                  </Button>
                </div>
              </Reveal>
            );
          })}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Stripe-secured billing</span>
          <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4" /> Credits never expire on paid plans</span>
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-brand-gradient p-12 text-center text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
            <h2 className="relative font-display text-3xl font-bold md:text-5xl">Your next 30 videos are one brief away.</h2>
            <p className="relative mx-auto mt-4 max-w-lg text-white/80">Join creators who replaced a 3-hour workflow with a 5-minute one.</p>
            <Button asChild size="xl" className="relative mt-8 bg-white text-brand-800 hover:bg-white/90">
              <Link href="/sign-up">Create your first video <ArrowRight /></Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
