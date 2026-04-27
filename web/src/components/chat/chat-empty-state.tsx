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
    <div className="relative z-10 flex flex-1 items-center justify-center px-8 py-12">
      <div className="w-full max-w-[720px] text-center animate-fade-up">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-[13px] border border-border bg-bg text-[19px] font-semibold text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          P
        </div>
        <h1 className="m-0 text-[30px] font-semibold tracking-[-0.025em] text-fg text-balance">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mx-0 mb-8 mt-2 text-[15px] text-fg-muted">
          What do you want to work on?
        </p>
        {showSuggestions ? (
          <div className="mx-auto grid max-w-[560px] grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <button
                key={s.text}
                type="button"
                onClick={() => onPickSuggestion(`${s.text} ${s.hint}`)}
                className="flex min-h-[74px] cursor-pointer items-start gap-3 rounded-[12px] border border-border-subtle bg-surface/75 px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-colors hover:border-border hover:bg-surface-2"
              >
                <span className="mt-px shrink-0 text-fg-muted">{s.icon}</span>
                <span className="text-[14px] leading-[1.5] text-fg">
                  {s.text}
                  <span className="mt-1 block text-[12.5px] text-fg-muted">
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
