import { Skeleton } from "@/components/ui/skeleton";

export function IssueSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0">
      <Skeleton className="size-1.5 shrink-0 rounded-full" />
      <Skeleton className="h-3 w-14 shrink-0" />
      <Skeleton className="h-3 flex-1" />
      <Skeleton className="hidden h-3 w-12 sm:block" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="animate-fade-in p-5">
      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="space-y-2 rounded-lg border border-border-subtle bg-surface px-4 py-3"
          >
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-8" />
          </div>
        ))}
      </section>

      <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div>
            {Array.from({ length: 6 }).map((_, index) => (
              <IssueSkeleton key={index} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border-subtle px-4 py-2.5">
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="space-y-3 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
