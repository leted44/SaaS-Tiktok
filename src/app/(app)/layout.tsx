import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { integrations } from "@/lib/env";

// A "use server" actions file cannot export its own route config, so this is
// where it lives instead — Next.js applies a layout's maxDuration to Server
// Actions invoked from any page beneath it. Script generation is now a
// draft-then-critique pass (two sequential AI calls), which needs more room
// than the platform's short default.
export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, image: true, plan: true, credits: true } });
  // The session cookie decodes fine but names a user that's gone (account
  // deleted, or a leftover cookie from before a database reset). Redirecting
  // straight to /sign-in would loop forever: it reads the same cookie, still
  // sees "logged in", and sends them right back. Clear the cookie first.
  if (!user) redirect("/api/auth/clear-session");
  const status = { ai: integrations.ai(), tts: integrations.tts(), stripe: integrations.stripe() };
  return (
    <AppShell user={user} status={status}>
      {children}
    </AppShell>
  );
}
