"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfile, changePassword, deleteAccount } from "@/server/actions/settings";

export function SettingsForms({ user }: { user: { name: string; email: string; hasPassword: boolean; createdAt: string; plan: string } }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [changing, setChanging] = useState(false);

  async function saveProfile() {
    setSaving(true);
    const res = await updateProfile({ name });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Profil mis à jour");
    router.refresh();
  }

  async function savePassword() {
    if (pw.next !== pw.confirm) return toast.error("Les mots de passe ne correspondent pas");
    setChanging(true);
    const res = await changePassword({ current: pw.current || "-", next: pw.next });
    setChanging(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Mot de passe mis à jour");
    setPw({ current: "", next: "", confirm: "" });
  }

  async function remove() {
    if (!confirm("Supprimer votre compte ainsi que tous les projets, scripts et rendus ? Cette action est irréversible.")) return;
    const res = await deleteAccount();
    if (res && !res.ok) toast.error(res.error);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Profil</CardTitle><CardDescription>Membre depuis {new Date(user.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} · Forfait {user.plan}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>E-mail</Label><Input value={user.email} disabled /></div>
          </div>
          <Button onClick={saveProfile} loading={saving}><Save /> Enregistrer</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mot de passe</CardTitle><CardDescription>{user.hasPassword ? "Modifiez votre mot de passe." : "Vous vous êtes inscrit avec Google. Définissez un mot de passe pour aussi vous connecter par e-mail."}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {user.hasPassword && <div className="space-y-1.5"><Label>Actuel</Label><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>}
            <div className="space-y-1.5"><Label>Nouveau mot de passe</Label><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Confirmer</Label><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></div>
          </div>
          <Button variant="secondary" onClick={savePassword} loading={changing} disabled={pw.next.length < 8}><KeyRound /> Mettre à jour le mot de passe</Button>
        </CardContent>
      </Card>

      <Card className="border-red-500/20">
        <CardHeader><CardTitle className="text-red-300">Zone de danger</CardTitle><CardDescription>Supprime définitivement votre compte et toutes les ressources associées.</CardDescription></CardHeader>
        <CardContent><Button variant="destructive" onClick={remove}><Trash2 /> Supprimer le compte</Button></CardContent>
      </Card>
    </div>
  );
}
