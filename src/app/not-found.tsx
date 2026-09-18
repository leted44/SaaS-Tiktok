import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-7xl font-bold text-white/10">404</p>
      <h1 className="font-display text-2xl font-bold">Ce clip n&apos;existe pas.</h1>
      <p className="text-muted-foreground">La page que vous cherchez a été déplacée ou n&apos;a jamais été générée.</p>
      <Button asChild variant="gradient"><Link href="/dashboard">Retour au studio</Link></Button>
    </div>
  );
}
