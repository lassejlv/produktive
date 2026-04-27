import { Button } from "@/components/ui/button";

export function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="animate-ink-bleed flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 grid size-14 place-items-center border border-ink bg-paper">
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 22 22"
          className="text-vermilion"
        >
          <path
            d="M11 3 v16 M3 11 h16"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </div>
      <p className="eyebrow mb-2">A blank ledger</p>
      <h3
        className="serif-tight text-[28px] font-medium leading-[1] tracking-tight text-ink"
        style={{ fontWeight: 500 }}
      >
        No issues filed <span className="serif-italic text-vermilion">yet</span>.
      </h3>
      <p className="mt-3 max-w-[320px] font-serif text-[14px] italic leading-relaxed text-ink-muted">
        Set the first piece of type. Every shipped product begins with a single
        line in the margin.
      </p>
      {onCreate ? (
        <Button className="mt-6" variant="outline" onClick={onCreate}>
          Compose first issue →
        </Button>
      ) : null}
    </div>
  );
}
