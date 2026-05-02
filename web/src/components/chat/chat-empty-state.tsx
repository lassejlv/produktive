import { SparkleIcon } from "@/components/chat/icons";

const suggestions = [
  {
    text: "Create an issue",
    hint: "for the dashboard redesign",
  },
  {
    text: "Find issues",
    hint: "assigned to me this week",
  },
  {
    text: "Summarize",
    hint: "what's in progress right now",
  },
  {
    text: "Triage inbox",
    hint: "and propose priorities",
  },
] as const;

export function ChatEmptyState({
  greeting,
  name,
  showSuggestions,
  onPickSuggestion,
}: {
  greeting: string;
  name?: string | null;
  showSuggestions: boolean;
  onPickSuggestion: (prompt: string) => void;
}) {
  return (
    <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-10">
      <div className="w-full max-w-[560px] text-center animate-fade-up">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted">
          <SparkleIcon size={18} />
        </div>
        <h1 className="m-0 text-[24px] font-medium tracking-[-0.02em] text-fg text-balance">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mx-0 mb-7 mt-1.5 text-[13px] text-fg-muted">
          What do you want to work on?
        </p>
        {showSuggestions ? (
          <div className="mx-auto grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {suggestions.map((s) => (
              <button
                key={s.text}
                type="button"
                onClick={() => onPickSuggestion(`${s.text} ${s.hint}`)}
                className="flex flex-col gap-0.5 rounded-md border border-border-subtle/60 bg-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface/50"
              >
                <span className="text-[13px] leading-tight text-fg">
                  {s.text}
                </span>
                <span className="text-[11.5px] leading-snug text-fg-muted">
                  {s.hint}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
