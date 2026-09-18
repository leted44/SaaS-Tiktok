import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/shared/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[#0B0714] lg:block">
        <div className="absolute inset-0 bg-brand-gradient opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
        <div className="absolute inset-0 dot-grid opacity-40" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Logo className="text-white" />
          <div>
            <blockquote className="font-display text-3xl font-bold leading-snug">
              « Je suis passée d'une vidéo par semaine à une par jour. Les scripts sont vraiment meilleurs que les miens. »
            </blockquote>
            <p className="mt-4 text-white/70">— Maya R., 412K abonnés sur TikTok</p>
          </div>
          <p className="text-xs text-white/60">Scripts · Voix off · Sous-titres dynamiques · Publication</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
