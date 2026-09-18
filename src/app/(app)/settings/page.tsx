import type { Metadata } from "next";
import { getCurrentUser } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { SettingsForms } from "@/components/settings/settings-forms";

export const metadata: Metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Paramètres" description="Profil, sécurité et gestion du compte." />
      <SettingsForms user={{ name: user.name ?? "", email: user.email, hasPassword: Boolean(user.passwordHash), createdAt: user.createdAt.toISOString(), plan: user.plan }} />
    </div>
  );
}
