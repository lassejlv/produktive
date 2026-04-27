import {
  HashIcon,
  PlusIcon,
  SearchIcon,
  SparkleIcon,
} from "@/components/chat/icons";

const suggestions = [
  {
    icon: <PlusIcon />,
    text: "Create an issue",
    hint: "for the dashboard redesign",
  },
  {
    icon: <SearchIcon />,
    text: "Find issues",
    hint: "assigned to me this week",
  },
  {
    icon: <SparkleIcon />,
    text: "Summarize",
    hint: "what's in progress right now",
  },
  {
    icon: <HashIcon />,
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
      <div className="w-full max-w-[620px] text-center animate-fade-up">
        <div className="mx-auto mb-4 grid size-10 place-items-center rounded-[10px] border border-border bg-bg text-[16px] font-semibold text-fg">
          P
        </div>
        <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em] text-fg text-balance">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mx-0 mb-6 mt-1.5 text-[13px] text-fg-muted">
          What do you want to work on?
        </p>
        {showSuggestions ? (
          <div className="mx-auto grid max-w-[560px] grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <button
                key={s.text}
                type="button"
                onClick={() => onPickSuggestion(`${s.text} ${s.hint}`)}
                className="flex min-h-[58px] cursor-pointer items-start gap-2.5 rounded-[8px] border border-border-subtle bg-surface/70 px-3 py-3 text-left transition-colors hover:border-border hover:bg-surface-2"
              >
                <span className="mt-px shrink-0 text-fg-muted">{s.icon}</span>
                <span className="text-[12.5px] leading-[1.45] text-fg">
                  {s.text}
                  <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                    {s.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
