import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "info" }> = {
  DRAFT: { label: "Brouillon", variant: "secondary" },
  SCRIPTED: { label: "Scripté", variant: "info" },
  VOICED: { label: "Voix générée", variant: "info" },
  READY: { label: "Prêt", variant: "default" },
  RENDERING: { label: "Rendu en cours", variant: "warning" },
  RENDERED: { label: "Rendu terminé", variant: "success" },
  PUBLISHED: { label: "Publié", variant: "success" },
  FAILED: { label: "Échoué", variant: "destructive" },
  QUEUED: { label: "En attente", variant: "secondary" },
  PROCESSING: { label: "En cours", variant: "warning" },
  COMPLETED: { label: "Terminé", variant: "success" },
  CANCELLED: { label: "Annulé", variant: "secondary" },
  SCHEDULED: { label: "Programmé", variant: "info" },
  PUBLISHING: { label: "Publication en cours", variant: "warning" },
  PENDING: { label: "En attente", variant: "secondary" },
};

export function StatusBadge({ status }: { status: string }) {
  const def = MAP[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={def.variant}>
      {(status === "RENDERING" || status === "PROCESSING" || status === "PUBLISHING") && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {def.label}
    </Badge>
  );
}
