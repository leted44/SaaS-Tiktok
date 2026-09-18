import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-7xl font-bold text-white/10">404</p>
      <h1 className="font-display text-2xl font-bold">This clip doesn&apos;t exist.</h1>
      <p className="text-muted-foreground">The page you&apos;re looking for was moved or never rendered.</p>
      <Button asChild variant="gradient"><Link href="/dashboard">Back to studio</Link></Button>
    </div>
  );
}
