"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Send, CalendarClock, Lock } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PlatformIcon, PLATFORM_LABEL } from "@/components/shared/platform-icon";
import { schedulePublish } from "@/server/actions/publish";
import type { RenderItem, AccountItem } from "@/components/exports/exports-hub";
import { cn } from "@/lib/utils";

export function PublishDialog({ render, accounts, schedulingAllowed, onClose, onDone }: { render: RenderItem | null; accounts: AccountItem[]; schedulingAllowed: boolean; onClose: () => void; onDone: () => void }) {
  const [accountId, setAccountId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (render) {
      setTitle(render.project.title);
      setCaption(render.project.title);
      setAccountId(accounts[0]?.id ?? "");
      setSchedule(false);
      const d = new Date(Date.now() + 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      setWhen(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
  }, [render, accounts]);

  async function submit() {
    if (!render) return;
    if (!accountId) return toast.error("Connectez d'abord un compte social.");
    setLoading(true);
    const res = await schedulePublish({
      renderJobId: render.id,
      socialAccountId: accountId,
      title,
      caption,
      hashtags: hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean),
      privacy,
      scheduledAt: schedule && when ? new Date(when).toISOString() : undefined,
    });
    setLoading(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.data.status === "PUBLISHED" ? "Publié !" : "Publication programmée");
    onDone();
  }

  const account = accounts.find((a) => a.id === accountId);

  return (
    <Dialog open={Boolean(render)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Publier « {render?.project.title} »</DialogTitle>
          <DialogDescription>Publiez maintenant ou programmez pour plus tard. Légendes et hashtags s'adaptent à chaque plateforme.</DialogDescription>
        </DialogHeader>
        {accounts.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-muted-foreground">Aucun compte connecté pour l'instant. Allez dans l'onglet <b className="text-foreground">Comptes</b> pour connecter TikTok, Instagram ou YouTube.</div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Destination</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {accounts.map((a) => (
                  <button key={a.id} type="button" onClick={() => setAccountId(a.id)} className={cn("flex items-center gap-3 rounded-lg border p-2.5 text-left transition", accountId === a.id ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05]"><PlatformIcon platform={a.platform} /></span>
                    <div className="min-w-0"><p className="truncate text-sm font-medium">@{a.username}</p><p className="text-[11px] text-muted-foreground">{PLATFORM_LABEL[a.platform]}</p></div>
                  </button>
                ))}
              </div>
            </div>
            {account?.platform === "YOUTUBE" && (
              <div className="space-y-1.5"><Label>Titre</Label><Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))} /></div>
            )}
            <div className="space-y-1.5"><Label>Légende</Label><Textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 2200))} rows={4} /><p className="text-right text-[11px] text-muted-foreground">{caption.length}/2200</p></div>
            <div className="space-y-1.5"><Label>Hashtags</Label><Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="fyp viral productivite" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Confidentialité</Label>
                <Select value={privacy} onValueChange={setPrivacy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="friends">Amis / Non répertorié</SelectItem><SelectItem value="private">Privé</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center justify-between">Programmation {!schedulingAllowed && <Lock className="h-3 w-3" />}</Label>
                <div className="flex h-10 items-center gap-3">
                  <Switch checked={schedule} onCheckedChange={setSchedule} disabled={!schedulingAllowed} />
                  <span className="text-sm text-muted-foreground">{schedule ? "Publier plus tard" : "Publier maintenant"}</span>
                </div>
                {!schedulingAllowed && <p className="text-[11px] text-muted-foreground">La programmation est une fonctionnalité <Link href="/billing" className="text-foreground underline">Créateur+</Link>.</p>}
              </div>
            </div>
            {schedule && <div className="space-y-1.5"><Label>Publier le</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="gradient" onClick={submit} loading={loading} disabled={accounts.length === 0}>{schedule ? <><CalendarClock /> Programmer</> : <><Send /> Publier maintenant</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
