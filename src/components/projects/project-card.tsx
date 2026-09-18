"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { MoreHorizontal, Trash2, Play, Film } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/status-badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { deleteProject } from "@/server/actions/projects";
import { relativeTime, cn } from "@/lib/utils";

export interface ProjectCardData {
  id: string;
  title: string;
  status: string;
  niche: string | null;
  topic: string | null;
  thumbnailUrl: string | null;
  updatedAt: string;
  aspectRatio: string;
  viralityScore: number | null;
  durationSec: number;
  hasRender: boolean;
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm(`Delete "${project.title}"? This removes scripts, voiceovers and renders.`)) return;
    setDeleting(true);
    const res = await deleteProject(project.id);
    setDeleting(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Project deleted");
    router.refresh();
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: deleting ? 0.4 : 1, y: 0 }} className="group surface relative overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-glow-sm">
      <Link href={`/studio/${project.id}`} className={cn("block", project.aspectRatio === "HORIZONTAL" ? "aspect-video" : project.aspectRatio === "SQUARE" ? "aspect-square" : "aspect-[4/5]")}>
        <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(160deg,#2a1657_0%,#0B0714_70%)]">
          {project.thumbnailUrl ? (
            <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-white/20"><Film className="h-10 w-10" /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur"><Play className="h-5 w-5 fill-white text-white" /></span>
          </div>
          <div className="absolute left-3 top-3"><StatusBadge status={project.status} /></div>
          {project.viralityScore !== null && (
            <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">⚡ {project.viralityScore}</div>
          )}
          <div className="absolute bottom-3 left-3 right-3">
            <p className="truncate font-semibold text-white">{project.title}</p>
            <p className="truncate text-xs text-white/70">{project.niche || project.topic || "No topic"} · {project.durationSec}s</p>
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
        <span>Edited {relativeTime(project.updatedAt)}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link href={`/studio/${project.id}`}>Open in studio</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} className="text-red-300 focus:text-red-200"><Trash2 /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
