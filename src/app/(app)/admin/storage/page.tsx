import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/queries";
import { isAdmin } from "@/lib/plans";
import { PageHeader } from "@/components/shared/page-header";
import { StorageMigration } from "@/components/admin/storage-migration";

export const metadata: Metadata = { title: "Stockage" };
export const dynamic = "force-dynamic";

export default async function AdminStoragePage() {
  const user = await getCurrentUser();
  if (!isAdmin(user.role)) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Stockage : passage à R2" description="Copie les fichiers de Supabase vers Cloudflare R2, puis fait pointer l'application vers R2." />
      <StorageMigration />
    </div>
  );
}
