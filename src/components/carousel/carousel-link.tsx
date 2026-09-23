import Link from "next/link";
import { ChevronRight, GalleryHorizontalEnd } from "lucide-react";

/** Entry point to the carousel editor, shown where a finished script or video already sits. */
export function CarouselLink({ projectId }: { projectId: string }) {
  return (
    <Link
      href={`/studio/${projectId}/carousel`}
      className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 transition hover:bg-primary/15"
    >
      <GalleryHorizontalEnd className="h-5 w-5 shrink-0 text-brand-300" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Créer le carrousel</p>
        <p className="text-[11px] text-muted-foreground">La même idée, réécrite en slides à lire — pour Instagram et TikTok.</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
