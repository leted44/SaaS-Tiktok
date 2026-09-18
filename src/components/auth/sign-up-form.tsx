"use client";

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
    toast.success("Welcome to ClipForge! 30 credits added.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {googleEnabled && (
        <>
          <GoogleButton label="Sign up with Google" />
          <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
        </>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required placeholder="Maya Rivera" />
          {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@studio.com" />
          {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" />
          {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
        </div>
        <Button type="submit" className="w-full" variant="gradient" loading={loading}>Create account</Button>
        <p className="text-center text-[11px] text-muted-foreground">By continuing you agree to the Terms and Privacy Policy.</p>
      </form>
    </div>
  );
}
