import { Skeleton } from "@/components/ui/skeleton";

export function ChatSkeleton() {
  return (
    <div className="relative z-10 flex flex-1 flex-col overflow-hidden px-6 pb-4 pt-8">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 animate-fade-in">
        <SkeletonUserMessage widthClass="w-2/5" lines={1} />
        <SkeletonAssistantMessage widths={["w-11/12", "w-10/12", "w-7/12"]} />
        <SkeletonUserMessage widthClass="w-1/3" lines={1} />
        <SkeletonAssistantMessage widths={["w-9/12", "w-11/12", "w-6/12", "w-8/12"]} />
        <SkeletonUserMessage widthClass="w-1/4" lines={1} />
      </div>
    </div>
  );
}

function SkeletonUserMessage({
  widthClass,
  lines,
}: {
  widthClass: string;
  lines: number;
}) {
  return (
    <div className="flex justify-end">
      <div
        className={`flex max-w-110 flex-col gap-2 rounded-lg border border-border bg-surface/80 px-3.5 py-2.5 ${widthClass}`}
      >
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-full bg-surface-3" />
        ))}
      </div>
    </div>
  );
}

function SkeletonAssistantMessage({ widths }: { widths: string[] }) {
  return (
    <div className="flex flex-col gap-2 max-w-170">
      {widths.map((widthClass, index) => (
        <Skeleton
          key={index}
          className={`h-3 ${widthClass} bg-surface-2`}
        />
      ))}
    </div>
  );
}
