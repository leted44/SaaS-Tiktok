import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-10 pt-4 sm:space-y-14">
      <div className="space-y-4">
        <Skeleton className="h-6 w-48 rounded-full" />
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-52 w-full max-w-3xl rounded-[1.75rem]" />
      </div>
      <Skeleton className="h-72 w-full rounded-[1.75rem]" />
      <div className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-[9/16] w-[46vw] max-w-[190px] shrink-0 rounded-2xl sm:w-auto sm:max-w-none" />)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
    </div>
  );
}
