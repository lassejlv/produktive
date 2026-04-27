import { Skeleton } from "@/components/ui/skeleton";

export function IssueSkeleton() {
  return (
    <div className="grid grid-cols-[40px_84px_minmax(0,1fr)_104px_94px_70px] items-center gap-3 border-b border-ink/10 px-4 py-3">
      <Skeleton className="h-3 w-6" />
      <Skeleton className="h-3 w-14" />
      <div className="min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-full max-w-[300px]" />
        <Skeleton className="h-3 w-full max-w-[200px]" />
      </div>
      <Skeleton className="h-6 w-20" />
      <Skeleton className="hidden h-3 w-16 lg:block" />
      <Skeleton className="hidden h-3 w-12 lg:block" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="animate-ink-bleed grid gap-8 px-6 py-6 lg:px-10 lg:py-8">
      <section className="grid grid-cols-2 border border-ink bg-paper-soft md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="space-y-3 border-ink/15 px-5 py-5 md:[&:not(:first-child)]:border-l"
          >
            <Skeleton className="h-2 w-16" />
            <Skeleton className="h-9 w-12" />
          </div>
        ))}
      </section>

      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
        <div className="border border-ink bg-paper-soft">
          <div className="space-y-2 border-b border-ink/15 px-5 py-4">
            <Skeleton className="h-2 w-28" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div>
            {Array.from({ length: 6 }).map((_, index) => (
              <IssueSkeleton key={index} />
            ))}
          </div>
        </div>

        <div className="border border-ink bg-paper-soft">
          <div className="space-y-2 border-b border-ink/15 px-5 py-4">
            <Skeleton className="h-2 w-32" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="space-y-5 px-5 py-5">
            <div className="space-y-2">
              <Skeleton className="h-2 w-12" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-2 w-20" />
              <Skeleton className="h-24 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-2 w-12" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-2 w-14" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
