import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
      plan: string;
    } & DefaultSession["user"];
  }
  interface User {
    role?: "USER" | "ADMIN";
    plan?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    plan?: string;
  }
}
