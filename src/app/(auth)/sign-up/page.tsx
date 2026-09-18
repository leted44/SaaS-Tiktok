import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Create your studio</h1>
      <p className="mt-1 text-sm text-muted-foreground">30 free credits. No credit card.</p>
      <div className="mt-8">
        <SignUpForm googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID)} />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
