import type { Metadata } from "next";
import { getCurrentUser } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { SettingsForms } from "@/components/settings/settings-forms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Profile, security and account controls." />
      <SettingsForms user={{ name: user.name ?? "", email: user.email, hasPassword: Boolean(user.passwordHash), createdAt: user.createdAt.toISOString(), plan: user.plan }} />
    </div>
  );
}
