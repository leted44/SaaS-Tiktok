import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { integrations } from "@/lib/env";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, image: true, plan: true, credits: true } });
  if (!user) redirect("/sign-in");
  const status = { ai: integrations.ai(), tts: integrations.tts(), stripe: integrations.stripe() };
  return (
    <AppShell user={user} status={status}>
      {children}
    </AppShell>
  );
}
