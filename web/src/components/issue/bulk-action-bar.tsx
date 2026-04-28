import {
  priorityOptions,
  statusLabel,
  statusOptions,
} from "@/lib/issue-constants";
import { priorityLabels } from "@/lib/issue-display";
import { cn } from "@/lib/utils";

export function BulkActionBar({
  count,
  onSetStatus,
  onSetPriority,
  onDelete,
  onClear,
}: {
  count: number;
  onSetStatus: (status: string) => void;
  onSetPriority: (priority: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-bg px-2 py-1 text-[12px] shadow-[0_18px_40px_rgba(0,0,0,0.45)]",
          "animate-fade-up",
        )}
      >
        <span className="px-2 text-fg">
          <span className="tabular-nums">{count}</span> selected
        </span>
        <div className="h-4 w-px bg-border-subtle" />
        <BulkSelect
          label="Status"
          ariaLabel="Set status"
          options={statusOptions.map((value) => ({
            value,
            label: statusLabel[value] ?? value,
          }))}
          onChange={onSetStatus}
        />
        <BulkSelect
          label="Priority"
          ariaLabel="Set priority"
          options={priorityOptions.map((value) => ({
            value,
            label: priorityLabels[value] ?? value,
          }))}
          onChange={onSetPriority}
        />
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-7 items-center rounded-full px-3 text-[12px] text-danger transition-colors hover:bg-danger/10"
        >
          Delete
        </button>
        <div className="h-4 w-px bg-border-subtle" />
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="grid size-6 place-items-center rounded-full text-fg-faint transition-colors hover:bg-surface hover:text-fg"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

function BulkSelect({
  label,
  ariaLabel,
  options,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative inline-flex h-7 cursor-pointer items-center rounded-full px-3 text-fg-muted transition-colors hover:bg-surface hover:text-fg">
      <span>{label}</span>
      <select
        aria-label={ariaLabel}
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) {
            onChange(event.target.value);
            event.target.value = "";
          }
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="" disabled hidden>
          {label}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
