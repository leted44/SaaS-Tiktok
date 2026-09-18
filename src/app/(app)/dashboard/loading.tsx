import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2"><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-96" /></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-80 lg:col-span-2" /><Skeleton className="h-80" /></div>
    </div>
  );
}
