import { Button } from "@/components/ui/button";

export function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <h3 className="text-sm font-medium text-fg">No issues yet</h3>
      <p className="mt-1 max-w-xs text-xs text-fg-muted">
        Create your first issue to start tracking work.
      </p>
      {onCreate ? (
        <Button className="mt-4" variant="outline" size="sm" onClick={onCreate}>
          New issue
        </Button>
      ) : null}
    </div>
  );
}
