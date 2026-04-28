import { Avatar } from "@/components/issue/avatar";
import { MemberPicker } from "@/components/issue/member-picker";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import {
  priorityOptions,
  statusLabel,
  statusOptions,
} from "@/lib/issue-constants";

type Assignee = { id: string; name: string; image: string | null };

export function IssueMetaStrip({
  status,
  priority,
  assignee,
  onChangeStatus,
  onChangePriority,
  onChangeAssignee,
}: {
  status: string;
  priority: string;
  assignee: Assignee | null;
  onChangeStatus: (next: string) => void;
  onChangePriority: (next: string) => void;
  onChangeAssignee: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[13px] text-fg-muted">
      <InlineSelect
        ariaLabel="Status"
        icon={<StatusIcon status={status} />}
        label={statusLabel[status] ?? status}
        value={status}
        options={statusOptions}
        onChange={onChangeStatus}
      />
      <Separator />
      <InlineSelect
        ariaLabel="Priority"
        icon={<PriorityIcon priority={priority} />}
        label={priority}
        value={priority}
        options={priorityOptions}
        onChange={onChangePriority}
      />
      <Separator />
      <MemberPicker
        selectedId={assignee?.id ?? null}
        onSelect={onChangeAssignee}
        trigger={({ onClick }) => (
          <button
            type="button"
            onClick={onClick}
            className="inline-flex h-6 items-center gap-1.5 rounded-[5px] px-1 transition-colors hover:bg-surface/60 hover:text-fg"
          >
            {assignee ? (
              <>
                <Avatar name={assignee.name} image={assignee.image} />
                <span>{assignee.name}</span>
              </>
            ) : (
              <span className="text-fg-faint">Unassigned</span>
            )}
          </button>
        )}
      />
    </div>
  );
}

function Separator() {
  return <span className="select-none px-0.5 text-fg-faint/60">·</span>;
}

function InlineSelect({
  ariaLabel,
  icon,
  label,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
}) {
  return (
    <label className="relative inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-[5px] px-1 capitalize transition-colors hover:bg-surface/60 hover:text-fg">
      {icon}
      <span>{label}</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
