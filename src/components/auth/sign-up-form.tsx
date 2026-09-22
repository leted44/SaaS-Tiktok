"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/auth/google-button";
import { registerUser } from "@/server/actions/auth";

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    const form = new FormData(e.currentTarget);
    const res = await registerUser({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
    setLoading(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
      return;
    }
    toast.success("Bienvenue sur ClipForge ! 30 crédits ajoutés.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {googleEnabled && (
        <>
          <GoogleButton label="S'inscrire avec Google" />
          <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-white/10" />ou<span className="h-px flex-1 bg-white/10" /></div>
        </>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nom</Label>
          <Input id="name" name="name" autoComplete="name" required placeholder="Maya Rivera" />
          {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="vous@studio.com" />
          {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="Au moins 8 caractères" />
          {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
        </div>
        <Button type="submit" className="w-full" variant="gradient" loading={loading}>Créer un compte</Button>
        <p className="text-center text-[11px] text-muted-foreground">
          En continuant, vous acceptez les{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">Conditions d&apos;utilisation</Link>
          {" "}et la{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Politique de confidentialité</Link>.
        </p>
      </form>
    </div>
  );
}
