import { Button } from "@/components/ui/button";

export function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center animate-fade-in-scale">
      <div className="mb-4 grid size-12 place-items-center rounded-xl border border-border bg-neutral-900/50">
        <svg
          className="h-5 w-5 text-neutral-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-neutral-200">No issues yet</h3>
      <p className="mt-1 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
        Create your first issue to start tracking work. Issues help you organize tasks and priorities.
      </p>
      {onCreate ? (
        <Button
          className="mt-4 h-8 text-xs"
          variant="outline"
          onClick={onCreate}
        >
          Create first issue
        </Button>
      ) : null}
    </div>
  );
}
