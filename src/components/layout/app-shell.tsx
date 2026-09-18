"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";

export interface ShellUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  plan: string;
  credits: number;
}

export function AppShell({ user, status, children }: { user: ShellUser; status: { ai: boolean; tts: boolean; stripe: boolean }; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} plan={user.plan} credits={user.credits} />
      <div className={cn("flex min-w-0 flex-1 flex-col transition-[padding] duration-300", collapsed ? "lg:pl-[76px]" : "lg:pl-[260px]")}>
        <Topbar user={user} status={status} onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 pb-16 pt-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
