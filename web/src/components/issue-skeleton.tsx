import { Skeleton } from "@/components/ui/skeleton";

export function IssueSkeleton() {
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)_98px] items-center gap-2.5 border-b border-border px-3.5 py-2.5 lg:grid-cols-[78px_minmax(0,1fr)_98px_74px_56px]">
      <Skeleton className="h-3.5 w-14" />
      <div className="min-w-0 space-y-1.5">
        <Skeleton className="h-3.5 w-full max-w-[280px]" />
        <Skeleton className="h-3 w-full max-w-[180px]" />
      </div>
      <Skeleton className="h-5 w-16" />
      <Skeleton className="hidden h-5 w-14 lg:block" />
      <Skeleton className="hidden h-3 w-12 lg:block" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-3.5 p-4 animate-fade-in">
      <section className="grid grid-cols-2 border border-border bg-card rounded-xl md:grid-cols-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="flex min-w-0 items-center justify-between border-border px-3 py-3"
            key={index}
          >
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-6" />
          </div>
        ))}
      </section>

      <section className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,392px)]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-row items-center justify-between gap-4 space-y-0 border-b border-border p-3.5">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-14" />
            </div>
          </div>
          <div>
            {Array.from({ length: 6 }).map((_, index) => (
              <IssueSkeleton key={index} />
            ))}
          </div>
        </div>

        <div className="sticky top-[72px] grid gap-3.5 border border-border bg-card rounded-xl p-3.5 max-lg:static">
          <Skeleton className="h-4 w-24" />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-8 w-full" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-20 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-8 w-full" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
