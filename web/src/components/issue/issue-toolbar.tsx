import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  priorityOptions,
  statusLabel,
  statusOptions,
} from "@/lib/issue-constants";
import {
  type Density,
  type DisplayOptions,
  type GroupBy,
  type ShownProperties,
  type SortBy,
  type ViewMode,
  priorityLabels,
} from "@/lib/issue-display";
import { cn } from "@/lib/utils";

export type IssueFilters = {
  statuses: string[];
  priorities: string[];
  assigneeIds: string[];
};

export const emptyFilters: IssueFilters = {
  statuses: [],
  priorities: [],
  assigneeIds: [],
};

export function filterCount(filters: IssueFilters) {
  return (
    filters.statuses.length +
    filters.priorities.length +
    filters.assigneeIds.length
  );
}

const groupOptions: { value: GroupBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
  { value: "none", label: "None" },
];

const sortOptions: { value: SortBy; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "priority", label: "Priority" },
];

const densityOptions: { value: Density; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

const propertyOptions: { key: keyof ShownProperties; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "id", label: "ID" },
  { key: "status", label: "Status" },
  { key: "assignee", label: "Assignee" },
  { key: "updated", label: "Updated" },
];

export function IssueToolbar({
  displayOptions,
  onDisplayChange,
  onPropertiesChange,
  filters,
  onFiltersChange,
}: {
  displayOptions: DisplayOptions;
  onDisplayChange: (patch: Partial<DisplayOptions>) => void;
  onPropertiesChange: (patch: Partial<ShownProperties>) => void;
  filters: IssueFilters;
  onFiltersChange: (next: IssueFilters) => void;
}) {
  const count = filterCount(filters);
  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors hover:bg-surface hover:text-fg",
              count > 0 ? "bg-surface text-fg" : "text-fg-muted",
            )}
          >
            <FilterIcon />
            <span>Filter</span>
            {count > 0 ? (
              <span className="tabular-nums text-[11px] text-fg-faint">
                {count}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0">
          <FilterPopoverBody filters={filters} onChange={onFiltersChange} />
        </PopoverContent>
      </Popover>
      <ViewModeToggle
        value={displayOptions.viewMode}
        onChange={(viewMode) => onDisplayChange({ viewMode })}
      />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <SlidersIcon />
            <span>Display</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <DisplayPopoverBody
            displayOptions={displayOptions}
            onChange={onDisplayChange}
            onPropertiesChange={onPropertiesChange}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FilterPopoverBody({
  filters,
  onChange,
}: {
  filters: IssueFilters;
  onChange: (next: IssueFilters) => void;
}) {
  const toggleStatus = (value: string) => {
    onChange({
      ...filters,
      statuses: filters.statuses.includes(value)
        ? filters.statuses.filter((v) => v !== value)
        : [...filters.statuses, value],
    });
  };
  const togglePriority = (value: string) => {
    onChange({
      ...filters,
      priorities: filters.priorities.includes(value)
        ? filters.priorities.filter((v) => v !== value)
        : [...filters.priorities, value],
    });
  };
  return (
    <div className="text-[12.5px]">
      <Section label="Status">
        <div className="flex flex-wrap gap-1">
          {statusOptions.map((value) => {
            const active = filters.statuses.includes(value);
            return (
              <FilterChip
                key={value}
                label={statusLabel[value] ?? value}
                active={active}
                onClick={() => toggleStatus(value)}
              />
            );
          })}
        </div>
      </Section>
      <Section label="Priority">
        <div className="flex flex-wrap gap-1">
          {priorityOptions.map((value) => {
            const active = filters.priorities.includes(value);
            return (
              <FilterChip
                key={value}
                label={priorityLabels[value] ?? value}
                active={active}
                onClick={() => togglePriority(value)}
              />
            );
          })}
        </div>
      </Section>
      {filterCount(filters) > 0 ? (
        <div className="border-t border-border-subtle px-3 py-2">
          <button
            type="button"
            onClick={() => onChange(emptyFilters)}
            className="text-[11.5px] text-fg-muted transition-colors hover:text-fg"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-2 text-[11.5px] capitalize transition-colors",
        active
          ? "border-border bg-surface text-fg"
          : "border-border-subtle bg-transparent text-fg-faint hover:text-fg-muted",
      )}
    >
      {label}
    </button>
  );
}

export function IssueFilterChips({
  filters,
  onChange,
}: {
  filters: IssueFilters;
  onChange: (next: IssueFilters) => void;
}) {
  if (filterCount(filters) === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle bg-bg px-5 py-1.5">
      {filters.statuses.map((value) => (
        <Chip
          key={`status:${value}`}
          label={statusLabel[value] ?? value}
          group="status"
          onRemove={() =>
            onChange({
              ...filters,
              statuses: filters.statuses.filter((v) => v !== value),
            })
          }
        />
      ))}
      {filters.priorities.map((value) => (
        <Chip
          key={`priority:${value}`}
          label={priorityLabels[value] ?? value}
          group="priority"
          onRemove={() =>
            onChange({
              ...filters,
              priorities: filters.priorities.filter((v) => v !== value),
            })
          }
        />
      ))}
      {filters.assigneeIds.map((value) => (
        <Chip
          key={`assignee:${value}`}
          label="me"
          group="assignee"
          onRemove={() =>
            onChange({
              ...filters,
              assigneeIds: filters.assigneeIds.filter((v) => v !== value),
            })
          }
        />
      ))}
      <button
        type="button"
        onClick={() => onChange(emptyFilters)}
        className="ml-1 text-[11px] text-fg-muted transition-colors hover:text-fg"
      >
        Clear
      </button>
    </div>
  );
}

function Chip({
  label,
  group,
  onRemove,
}: {
  label: string;
  group: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border-subtle bg-surface/40 pl-2 pr-1 text-[11.5px] capitalize text-fg">
      <span className="text-fg-faint">{group}:</span>
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${group} filter ${label}`}
        className="grid size-4 place-items-center rounded-sm text-fg-faint transition-colors hover:bg-surface hover:text-fg"
      >
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M3 3l6 6M9 3l-6 6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  return (
    <div className="inline-flex h-7 items-center rounded-md border border-border-subtle p-0.5">
      <button
        type="button"
        onClick={() => onChange("list")}
        aria-label="List view"
        className={cn(
          "grid size-6 place-items-center rounded-[4px] transition-colors",
          value === "list"
            ? "bg-surface text-fg"
            : "text-fg-faint hover:text-fg",
        )}
      >
        <ListIcon />
      </button>
      <button
        type="button"
        onClick={() => onChange("board")}
        aria-label="Board view"
        className={cn(
          "grid size-6 place-items-center rounded-[4px] transition-colors",
          value === "board"
            ? "bg-surface text-fg"
            : "text-fg-faint hover:text-fg",
        )}
      >
        <BoardIcon />
      </button>
    </div>
  );
}

function DisplayPopoverBody({
  displayOptions,
  onChange,
  onPropertiesChange,
}: {
  displayOptions: DisplayOptions;
  onChange: (patch: Partial<DisplayOptions>) => void;
  onPropertiesChange: (patch: Partial<ShownProperties>) => void;
}) {
  return (
    <div className="text-[12.5px]">
      <Section label="Grouping">
        <SegmentedControl
          options={groupOptions}
          value={displayOptions.groupBy}
          onChange={(value) => onChange({ groupBy: value })}
        />
      </Section>
      <Section label="Ordering">
        <SegmentedControl
          options={sortOptions}
          value={displayOptions.sortBy}
          onChange={(value) => onChange({ sortBy: value })}
        />
      </Section>
      <Section label="Density">
        <SegmentedControl
          options={densityOptions}
          value={displayOptions.density}
          onChange={(value) => onChange({ density: value })}
        />
      </Section>
      <Section label="Properties">
        <div className="flex flex-wrap gap-1">
          {propertyOptions.map(({ key, label }) => {
            const active = displayOptions.properties[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPropertiesChange({ [key]: !active })}
                className={cn(
                  "inline-flex h-6 items-center rounded-md border px-2 text-[11.5px] transition-colors",
                  active
                    ? "border-border bg-surface text-fg"
                    : "border-border-subtle bg-transparent text-fg-faint hover:text-fg-muted",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border-subtle px-3 py-2.5 last:border-b-0">
      <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
        {label}
      </div>
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 rounded-md border text-[11.5px] transition-colors",
            value === option.value
              ? "border-border bg-surface text-fg"
              : "border-border-subtle bg-transparent text-fg-muted hover:bg-surface hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SlidersIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 6h12m4 0h-2M4 12h6m10 0H14M4 18h12m4 0h-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17" cy="6" r="1.6" fill="currentColor" />
      <circle cx="11" cy="12" r="1.6" fill="currentColor" />
      <circle cx="17" cy="18" r="1.6" fill="currentColor" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3 5h18l-7 9v6l-4-2v-4L3 5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="4"
        y="5"
        width="5"
        height="14"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="11"
        y="5"
        width="5"
        height="9"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="18"
        y="5"
        width="2"
        height="11"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
