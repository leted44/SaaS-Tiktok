import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { loginSchema } from "@/lib/validations";
import { PLANS } from "@/lib/plans";
import { grantCredits } from "@/lib/credits";
import { slugify } from "@/lib/utils";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...authConfig.providers,
    Credentials({
      name: "Email & password",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role, plan: user.plan };
      },
    }),
  ],
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      await ensureUserProvisioned(user.id, user.name ?? user.email ?? "My Brand");
    },
  },
});

/** Give every new user a workspace and their signup credits (idempotent). */
export async function ensureUserProvisioned(userId: string, displayName: string) {
  const existing = await prisma.workspace.findFirst({ where: { ownerId: userId } });
  if (!existing) {
    const base = slugify(displayName) || "workspace";
    await prisma.workspace.create({
      data: { ownerId: userId, name: `${displayName.split(" ")[0]}'s Studio`, slug: `${base}-${userId.slice(-6)}` },
    });
  }
  const bonus = await prisma.creditTransaction.findFirst({ where: { userId, type: "SIGNUP_BONUS" } });
  if (!bonus) {
    await grantCredits(userId, PLANS.FREE.monthlyCredits, "SIGNUP_BONUS", "Crédits de bienvenue");
  }
}

/** Returns the current session user or throws — for server actions and route handlers. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError();
  return session.user;
}

export async function requireDbUser() {
  const sessionUser = await requireUser();
  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) throw new AuthError();
  return user;
}

export class AuthError extends Error {
  readonly code = "UNAUTHORIZED";
  constructor() {
    super("Vous devez être connecté(e).");
  }
}
