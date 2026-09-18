"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, FolderKanban, Sparkles, Mic2, Send, Palette, CreditCard, Settings, ChevronLeft, X, Zap, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PLANS } from "@/lib/plans";
import type { Plan } from "@prisma/client";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/scripts", label: "Script generator", icon: Sparkles },
  { href: "/voices", label: "Voices", icon: Mic2 },
  { href: "/exports", label: "Exports & publishing", icon: Send },
  { href: "/brand", label: "Brand kit", icon: Palette },
];
const SECONDARY = [
  { href: "/billing", label: "Billing & credits", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  plan: string;
  credits: number;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose, plan, credits }: Props) {
  const pathname = usePathname();
  const planDef = PLANS[plan as Plan] ?? PLANS.FREE;
  const pct = Math.min(100, Math.round((credits / Math.max(1, planDef.monthlyCredits)) * 100));

  const content = (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center border-b border-white/[0.05] px-4", collapsed ? "justify-center" : "justify-between")}>
        <Logo compact={collapsed} href="/dashboard" />
        <button onClick={onMobileClose} className="rounded-md p-1 text-muted-foreground hover:bg-white/5 lg:hidden"><X className="h-4 w-4" /></button>
        {!collapsed && (
          <button onClick={onToggle} className="hidden rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground lg:block" aria-label="Collapse sidebar">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <NavGroup items={NAV} pathname={pathname} collapsed={collapsed} onNavigate={onMobileClose} />
        <NavGroup items={SECONDARY} pathname={pathname} collapsed={collapsed} onNavigate={onMobileClose} label="Account" />
      </nav>

      <div className="border-t border-white/[0.05] p-3">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/billing" className="flex h-10 items-center justify-center rounded-lg bg-white/[0.04] text-brand-300 hover:bg-white/[0.08]"><Coins className="h-4 w-4" /></Link>
            </TooltipTrigger>
            <TooltipContent side="right">{credits} credits · {planDef.name}</TooltipContent>
          </Tooltip>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">{planDef.name} plan</span>
              <span className="inline-flex items-center gap-1 font-semibold text-brand-200"><Coins className="h-3 w-3" /> {credits}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className={cn("h-full rounded-full transition-all", pct < 20 ? "bg-amber-400" : "bg-brand-gradient")} style={{ width: `${pct}%` }} />
            </div>
            {plan === "FREE" ? (
              <Link href="/billing" className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-brand-gradient py-1.5 text-xs font-semibold text-white shadow-glow-sm transition hover:brightness-110">
                <Zap className="h-3 w-3" /> Upgrade
              </Link>
            ) : (
              <Link href="/billing" className="mt-2 block text-center text-[11px] text-muted-foreground hover:text-foreground">Buy more credits</Link>
            )}
          </div>
        )}
        {collapsed && (
          <button onClick={onToggle} className="mt-3 hidden w-full items-center justify-center rounded-md py-1 text-muted-foreground hover:bg-white/5 hover:text-foreground lg:flex" aria-label="Expand sidebar">
            <ChevronLeft className="h-4 w-4 rotate-180" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className={cn("fixed inset-y-0 left-0 z-40 hidden border-r border-white/[0.05] bg-[#0B0714]/80 backdrop-blur-xl transition-[width] duration-300 lg:block", collapsed ? "w-[76px]" : "w-[260px]")}>{content}</aside>
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onMobileClose} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-white/[0.05] bg-[#0B0714] lg:hidden">
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavGroup({ items, pathname, collapsed, onNavigate, label }: { items: typeof NAV; pathname: string; collapsed: boolean; onNavigate: () => void; label?: string }) {
  return (
    <div>
      {label && !collapsed && <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</p>}
      <ul className="space-y-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.href === "/projects" && pathname.startsWith("/studio"));
          const link = (
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg border border-primary/30 bg-primary/15" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <item.icon className={cn("relative h-4 w-4 shrink-0", active && "text-brand-300")} />
              {!collapsed && <span className="relative">{item.label}</span>}
            </Link>
          );
          return (
            <li key={item.href}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
