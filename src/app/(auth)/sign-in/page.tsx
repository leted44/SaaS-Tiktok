import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Connexion" };

export default function SignInPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Content de vous revoir</h1>
      <p className="mt-1 text-sm text-muted-foreground">Connectez-vous à votre studio.</p>
      <div className="mt-8">
        <SignInForm googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID)} />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Nouveau ici ? <Link href="/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">Créer un compte</Link>
      </p>
    </div>
  );
}
