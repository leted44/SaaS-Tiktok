import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-96" /></div>
      <Skeleton className="h-10 w-80" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
    </div>
  );
}
