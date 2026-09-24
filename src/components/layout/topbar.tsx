"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus, LogOut, Settings, CreditCard, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOutAction } from "@/server/actions/settings";
import type { ShellUser } from "@/components/layout/app-shell";

const TITLES: Record<string, string> = {
  "/dashboard": "Tableau de bord",
  "/projects": "Projets",
  "/scripts": "Générateur de script",
  "/voices": "Voix",
  "/autopilot": "Pilote automatique",
  "/exports": "Exports & publication",
  "/brand": "Charte de marque",
  "/billing": "Facturation & crédits",
  "/settings": "Paramètres",
  "/studio": "Studio",
};

export function Topbar({ user, status, onMenu }: { user: ShellUser; status: { ai: boolean; tts: boolean; stripe: boolean }; onMenu: () => void }) {
  const pathname = usePathname();
  const base = `/${pathname.split("/")[1]}`;
  const title = TITLES[base] ?? "VidiSprint";
  const missing = [!status.ai && "Scripts IA", !status.tts && "Voix off", !status.stripe && "Facturation"].filter(Boolean) as string[];
  const initials = (user.name ?? user.email).split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.05] bg-background/70 px-4 backdrop-blur-xl md:px-8">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 lg:hidden"><Menu className="h-5 w-5" /></button>
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Studio</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span className="font-medium">{title}</span>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        {missing.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="hidden items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 md:inline-flex">
                <AlertTriangle className="h-3 w-3" /> {missing.length} intégration{missing.length > 1 ? "s" : ""} non configurée{missing.length > 1 ? "s" : ""}
              </span>
            </TooltipTrigger>
            <TooltipContent>Clés manquantes pour : {missing.join(", ")}. Voir .env.example.</TooltipContent>
          </Tooltip>
        )}
        <Button asChild size="sm" variant="gradient" className="hidden md:inline-flex">
          <Link href="/scripts"><Plus /> Nouvelle vidéo</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full ring-focus">
              <Avatar>
                {user.image && <AvatarImage src={user.image} alt={user.name ?? ""} />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="normal-case tracking-normal">
              <p className="text-sm font-medium text-foreground">{user.name ?? "Créateur"}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/billing"><CreditCard /> Facturation · {user.credits} crédits</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings"><Settings /> Paramètres</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOutAction()} className="text-red-300 focus:text-red-200"><LogOut /> Se déconnecter</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
