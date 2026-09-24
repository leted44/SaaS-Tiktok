import Link from "next/link";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] bg-brand-gradient-soft blur-3xl" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid-fade bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      <header className="sticky top-0 z-40 border-b border-white/[0.05] bg-background/60 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <Link href="#features" className="transition-colors hover:text-foreground">Fonctionnalités</Link>
            <Link href="#workflow" className="transition-colors hover:text-foreground">Workflow</Link>
            <Link href="#pricing" className="transition-colors hover:text-foreground">Tarifs</Link>
          </nav>
          <div className="flex items-center gap-2">
            {session?.user ? (
              <Button asChild variant="gradient"><Link href="/dashboard">Ouvrir le studio</Link></Button>
            ) : (
              <>
                <Button asChild variant="ghost"><Link href="/sign-in">Connexion</Link></Button>
                <Button asChild variant="gradient"><Link href="/sign-up">Essai gratuit</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-white/[0.05] py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <Logo compact />
          <p>© {new Date().getFullYear()} VidiSprint. Conçu pour les créateurs qui publient chaque jour.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/sign-in" className="hover:text-foreground">Connexion</Link>
            <Link href="#pricing" className="hover:text-foreground">Tarifs</Link>
            <Link href="/legal" className="hover:text-foreground">Mentions légales</Link>
            <Link href="/terms" className="hover:text-foreground">CGU</Link>
            <Link href="/privacy" className="hover:text-foreground">Confidentialité</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
