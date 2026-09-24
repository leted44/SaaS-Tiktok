"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { markProjectPosted } from "@/server/actions/projects";
import { POST_PLATFORMS, POST_PLATFORM_LABELS, type PostPlatform } from "@/lib/projects/progress";
import { cn } from "@/lib/utils";

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Record where and when a video went out, so the list shows what's already been used. */
export function MarkPostedDialog({ projectId, title, open, onOpenChange }: { projectId: string; title: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [platforms, setPlatforms] = useState<PostPlatform[]>(["tiktok"]);
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const toggle = (p: PostPlatform) => setPlatforms((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  async function save() {
    setSaving(true);
    // Noon local time: the day stays the same whatever the time zone.
    const at = date === today() ? new Date() : new Date(`${date}T12:00:00`);
    const res = await markProjectPosted(projectId, platforms, at.toISOString());
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Vidéo marquée comme publiée.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marquer comme publiée</DialogTitle>
          <DialogDescription className="line-clamp-2">« {title} »</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Publiée sur</Label>
            <div className="flex flex-wrap gap-2">
              {POST_PLATFORMS.map((p) => (
                <button key={p} type="button" onClick={() => toggle(p)} aria-pressed={platforms.includes(p)} className={cn("rounded-full border px-3 py-1.5 text-sm transition", platforms.includes(p) ? "border-primary/60 bg-primary/15 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/25")}>
                  {POST_PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="posted-date">Date</Label>
            <Input id="posted-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="w-44" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button type="button" variant="gradient" loading={saving} onClick={save}><CheckCircle2 /> Marquer publiée</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
