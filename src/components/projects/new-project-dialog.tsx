"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProject } from "@/server/actions/projects";

export function NewProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aspect, setAspect] = useState("VERTICAL");
  const [duration, setDuration] = useState("45");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await createProject({ title: form.get("title"), topic: form.get("topic"), niche: form.get("niche"), aspectRatio: aspect, targetDurationSec: Number(duration) });
    setLoading(false);
    if (!res.ok) return toast.error(res.error);
    setOpen(false);
    router.push(`/studio/${res.data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gradient"><Plus /> New project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Set the basics. You can generate the script inside the studio.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required placeholder="3 mistakes killing your sleep" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic / brief</Label>
            <Textarea id="topic" name="topic" placeholder="What should this video be about?" rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="niche">Niche</Label>
              <Input id="niche" name="niche" placeholder="Health" />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={aspect} onValueChange={setAspect}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VERTICAL">9:16 Vertical</SelectItem>
                  <SelectItem value="SQUARE">1:1 Square</SelectItem>
                  <SelectItem value="HORIZONTAL">16:9 Wide</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["15", "30", "45", "60", "90"].map((d) => <SelectItem key={d} value={d}>{d}s</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="gradient" loading={loading}>Create project</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
