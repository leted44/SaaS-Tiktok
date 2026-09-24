import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { integrations } from "@/lib/env";

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
