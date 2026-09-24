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
import type { SpaceOption } from "@/lib/spaces";

const NO_SPACE = "__none__";

export function NewProjectDialog({ spaces = [] }: { spaces?: SpaceOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aspect, setAspect] = useState("VERTICAL");
  const [duration, setDuration] = useState("45");
  const [spaceId, setSpaceId] = useState(NO_SPACE);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await createProject({ title: form.get("title"), topic: form.get("topic"), niche: form.get("niche"), aspectRatio: aspect, targetDurationSec: Number(duration), spaceId: spaceId === NO_SPACE ? null : spaceId });
    setLoading(false);
    if (!res.ok) return toast.error(res.error);
    setOpen(false);
    router.push(`/studio/${res.data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gradient"><Plus /> Nouveau projet</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
          <DialogDescription>Définissez les bases. Vous pourrez générer le script dans le studio.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Titre</Label>
            <Input id="title" name="title" required placeholder="3 erreurs qui ruinent votre sommeil" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topic">Sujet / brief</Label>
            <Textarea id="topic" name="topic" placeholder="De quoi devrait parler cette vidéo ?" rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="niche">Niche</Label>
              <Input id="niche" name="niche" placeholder="Santé" />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={aspect} onValueChange={setAspect}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VERTICAL">9:16 Vertical</SelectItem>
                  <SelectItem value="SQUARE">1:1 Carré</SelectItem>
                  <SelectItem value="HORIZONTAL">16:9 Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Durée</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["15", "30", "45", "60", "90"].map((d) => <SelectItem key={d} value={d}>{d}s</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {spaces.length > 0 && (
            <div className="space-y-1.5">
              <Label>Espace</Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SPACE}>Aucun espace</SelectItem>
                  {spaces.map((s) => <SelectItem key={s.id} value={s.id}><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.color }} />{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" variant="gradient" loading={loading}>Créer le projet</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
