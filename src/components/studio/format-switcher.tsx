import Link from "next/link";
import { Film, GalleryHorizontalEnd } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Video and carousel are two peer outputs of the same project, not a main
 * feature and an add-on tucked behind it — so switching between them is one
 * tap, in the same spot, from either side. Used at the top of both editors.
 */
export function FormatSwitcher({ projectId, active }: { projectId: string; active: "video" | "carousel" }) {
  const tabs = [
    { id: "video" as const, label: "Vidéo", href: `/studio/${projectId}`, icon: Film },
    { id: "carousel" as const, label: "Carrousel", href: `/studio/${projectId}/carousel`, icon: GalleryHorizontalEnd },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={active === t.id ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
            active === t.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <t.icon className="h-3.5 w-3.5" /> {t.label}
        </Link>
      ))}
    </div>
  );
}
