import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "info" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SCRIPTED: { label: "Scripted", variant: "info" },
  VOICED: { label: "Voiced", variant: "info" },
  READY: { label: "Ready", variant: "default" },
  RENDERING: { label: "Rendering", variant: "warning" },
  RENDERED: { label: "Rendered", variant: "success" },
  PUBLISHED: { label: "Published", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  QUEUED: { label: "Queued", variant: "secondary" },
  PROCESSING: { label: "Processing", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
  SCHEDULED: { label: "Scheduled", variant: "info" },
  PUBLISHING: { label: "Publishing", variant: "warning" },
  PENDING: { label: "Pending", variant: "secondary" },
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
