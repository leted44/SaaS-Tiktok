import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-6 flex items-center justify-between"><Skeleton className="h-8 w-72" /><Skeleton className="h-10 w-40" /></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4"><Skeleton className="mx-auto aspect-[9/16] w-full max-w-[380px] rounded-2xl" /><Skeleton className="h-20 w-full" /></div>
        <Skeleton className="h-[720px]" />
      </div>
    </div>
  );
}
