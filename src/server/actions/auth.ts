"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations";
import { ensureUserProvisioned, signIn } from "@/lib/auth";
import { guard, type ActionResult } from "@/server/action-result";

export async function registerUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const data = registerSchema.parse(input);
    const email = data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error("Un compte existe déjà avec cet e-mail. Connectez-vous plutôt.");
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({ data: { name: data.name, email, passwordHash } });
    await ensureUserProvisioned(user.id, data.name);
    await signIn("credentials", { email, password: data.password, redirect: false });
    return { id: user.id };
  });
}

export async function loginWithPassword(input: { email: string; password: string }): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const res = await signIn("credentials", { email: input.email.toLowerCase(), password: input.password, redirect: false });
    if (!res || (typeof res === "string" && res.includes("error"))) throw new Error("E-mail ou mot de passe invalide.");
    return undefined;
  }).catch(() => ({ ok: false as const, error: "Invalid email or password.", code: "INVALID_CREDENTIALS" }));
}
