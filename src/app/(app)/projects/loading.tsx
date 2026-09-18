import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-80" /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
    </div>
  );
}
