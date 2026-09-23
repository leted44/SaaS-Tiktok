import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-compatible auth config (no Prisma import) — used by middleware.
 * Providers needing Node APIs (Credentials + bcrypt) are added in src/lib/auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/sign-in", newUser: "/dashboard" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET, allowDangerousEmailAccountLinking: true })]
      : []),
  ],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;
      const isApp = ["/dashboard", "/projects", "/scripts", "/voices", "/studio", "/exports", "/brand", "/billing", "/settings", "/onboarding", "/autopilot"].some((p) => pathname.startsWith(p));
      if (isApp) return isLoggedIn;
      return true;
    },
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "USER";
        token.plan = (user as { plan?: string }).plan ?? "FREE";
      }
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.image !== undefined) token.picture = session.image;
        if (session.plan) token.plan = session.plan;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
        session.user.plan = (token.plan as string) ?? "FREE";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
