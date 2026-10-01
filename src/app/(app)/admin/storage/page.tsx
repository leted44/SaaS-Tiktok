import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/queries";
import { isAdmin } from "@/lib/plans";
import { PageHeader } from "@/components/shared/page-header";
import { StorageMigration } from "@/components/admin/storage-migration";
import { StorageCleanup } from "@/components/admin/storage-cleanup";

export const metadata: Metadata = { title: "Stockage" };
export const dynamic = "force-dynamic";

export default async function AdminStoragePage() {
  const user = await getCurrentUser();
  if (!isAdmin(user.role)) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Stockage" description="Passage à Cloudflare R2 et nettoyage des fichiers inutilisés." />
      <StorageMigration />
      <StorageCleanup />
    </div>
  );
}
