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
    toast.success("Profile updated");
    router.refresh();
  }

  async function savePassword() {
    if (pw.next !== pw.confirm) return toast.error("Passwords do not match");
    setChanging(true);
    const res = await changePassword({ current: pw.current || "-", next: pw.next });
    setChanging(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Password updated");
    setPw({ current: "", next: "", confirm: "" });
  }

  async function remove() {
    if (!confirm("Delete your account and all projects, scripts and renders? This cannot be undone.")) return;
    const res = await deleteAccount();
    if (res && !res.ok) toast.error(res.error);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Member since {new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })} · {user.plan} plan</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={user.email} disabled /></div>
          </div>
          <Button onClick={saveProfile} loading={saving}><Save /> Save</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Password</CardTitle><CardDescription>{user.hasPassword ? "Change your password." : "You signed up with Google. Set a password to also sign in with email."}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {user.hasPassword && <div className="space-y-1.5"><Label>Current</Label><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>}
            <div className="space-y-1.5"><Label>New password</Label><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Confirm</Label><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></div>
          </div>
          <Button variant="secondary" onClick={savePassword} loading={changing} disabled={pw.next.length < 8}><KeyRound /> Update password</Button>
        </CardContent>
      </Card>

      <Card className="border-red-500/20">
        <CardHeader><CardTitle className="text-red-300">Danger zone</CardTitle><CardDescription>Permanently delete your account and every asset in it.</CardDescription></CardHeader>
        <CardContent><Button variant="destructive" onClick={remove}><Trash2 /> Delete account</Button></CardContent>
      </Card>
    </div>
  );
}
