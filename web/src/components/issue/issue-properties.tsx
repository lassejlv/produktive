import { Avatar } from "@/components/issue/avatar";
import { MemberPicker } from "@/components/issue/member-picker";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import { LabelChip } from "@/components/label/label-chip";
import { LabelPicker } from "@/components/label/label-picker";
import { ProjectIcon } from "@/components/project/project-icon";
import { ProjectPicker } from "@/components/project/project-picker";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { type IssueStatus, type LabelSummary, type ProjectSummary } from "@/lib/api";
import { priorityOptions, sortedStatuses, statusName } from "@/lib/issue-constants";
import { priorityLabels } from "@/lib/issue-display";

type Assignee = { id: string; name: string; image: string | null };

export function IssueProperties({
  status,
  statuses,
  priority,
  assignee,
  project,
  labels,
  onChangeStatus,
  onChangePriority,
  onChangeAssignee,
  onChangeProject,
  onChangeLabels,
}: {
  status: string;
  statuses: IssueStatus[];
  priority: string;
  assignee: Assignee | null;
  project: ProjectSummary | null;
  labels: LabelSummary[];
  onChangeStatus: (next: string) => void;
  onChangePriority: (next: string) => void;
  onChangeAssignee: (id: string | null) => void;
  onChangeProject: (id: string | null) => void;
  onChangeLabels: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-col">
      <PropertyRow label="Status">
        <NativeSelectTrigger
          ariaLabel="Status"
          icon={<StatusIcon status={status} statuses={statuses} />}
          label={statusName(statuses, status)}
          value={status}
          options={sortedStatuses(statuses).map((entry) => ({
            value: entry.key,
            label: entry.name,
          }))}
          onChange={onChangeStatus}
        />
      </PropertyRow>

      <div data-tour="issue-fields">
        <PropertyRow label="Priority">
          <NativeSelectTrigger
            ariaLabel="Priority"
            icon={<PriorityIcon priority={priority} />}
            label={priorityLabels[priority] ?? priority}
            value={priority}
            options={priorityOptions.map((value) => ({
              value,
              label: priorityLabels[value] ?? value,
            }))}
            onChange={onChangePriority}
          />
        </PropertyRow>

        <PropertyRow label="Assignee">
          <MemberPicker
            selectedId={assignee?.id ?? null}
            onSelect={onChangeAssignee}
            trigger={({ onClick }) => (
              <PickerTrigger onClick={onClick}>
                {assignee ? (
                  <>
                    <Avatar name={assignee.name} image={assignee.image} />
                    <span className="min-w-0 flex-1 truncate">{assignee.name}</span>
                  </>
                ) : (
                  <span className="text-fg-faint">Unassigned</span>
                )}
              </PickerTrigger>
            )}
          />
        </PropertyRow>
      </div>

      <PropertyRow label="Project">
        <ProjectPicker
          selectedId={project?.id ?? null}
          onSelect={onChangeProject}
          trigger={({ onClick }) => (
            <PickerTrigger onClick={onClick}>
              {project ? (
                <>
                  <ProjectIcon
                    color={project.color}
                    icon={project.icon}
                    name={project.name}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                </>
              ) : (
                <span className="text-fg-faint">No project</span>
              )}
            </PickerTrigger>
          )}
        />
      </PropertyRow>

      <PropertyRow label="Labels" align="start">
        <LabelPicker
          selectedIds={labels.map((l) => l.id)}
          onChange={onChangeLabels}
          trigger={({ onClick }) => (
            <button
              type="button"
              onClick={onClick}
              className="flex min-h-7 w-full flex-wrap items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              {labels.length > 0 ? (
                labels.map((label) => (
                  <LabelChip key={label.id} name={label.name} color={label.color} size="sm" />
                ))
              ) : (
                <span className="text-fg-faint">+ Add label</span>
              )}
            </button>
          )}
        />
      </PropertyRow>
    </div>
  );
}

function PropertyRow({
  label,
  children,
  align = "center",
}: {
  label: string;
  children: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      className={
        align === "start"
          ? "grid grid-cols-[64px_minmax(0,1fr)] items-start gap-2 py-1 text-[12.5px]"
          : "grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2 py-1 text-[12.5px]"
      }
    >
      <span className={align === "start" ? "pt-2 text-fg-faint" : "text-fg-faint"}>{label}</span>
      <div className="min-w-0 text-fg">{children}</div>
    </div>
  );
}

function PickerTrigger({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}

function NativeSelectTrigger({
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
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-7 border-0 bg-transparent px-1.5 hover:border-transparent hover:bg-surface [&>svg]:ml-auto"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
