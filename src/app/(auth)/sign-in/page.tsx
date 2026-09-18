import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your studio.</p>
      <div className="mt-8">
        <SignInForm googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID)} />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here? <Link href="/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">Create an account</Link>
      </p>
    </div>
  );
}
