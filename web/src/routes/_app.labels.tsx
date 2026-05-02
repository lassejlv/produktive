import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { NewLabelDialog } from "@/components/label/new-label-dialog";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { type Label, deleteLabel, updateLabel } from "@/lib/api";
import { labelColorHex, labelColorOptions } from "@/lib/label-constants";
import { useLabels } from "@/lib/use-labels";
import { cn } from "@/lib/utils";

type ViewKey = "all" | "active" | "archived";

const viewLabels: Record<ViewKey, string> = {
  all: "All",
  active: "Active",
  archived: "Archived",
};

const exampleLabels = [
  { name: "bug", color: "red" },
  { name: "design", color: "purple" },
  { name: "tech-debt", color: "orange" },
  { name: "frontend", color: "blue" },
  { name: "P1", color: "yellow" },
] as const;

export const Route = createFileRoute("/_app/labels")({
  component: LabelsPage,
});

function LabelsPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewKey>("active");
  const includeArchived = view === "archived" || view === "all";
  const { labels, isLoading, refresh, addLabel, updateLabelLocal, removeLabelLocal } =
    useLabels(includeArchived);
  const { confirm, dialog } = useConfirmDialog();

  const filtered = useMemo(() => {
    if (view === "all") return labels;
    if (view === "active") return labels.filter((l) => l.archivedAt === null);
    return labels.filter((l) => l.archivedAt !== null);
  }, [labels, view]);

  const counts = useMemo(
    () => ({
      all: labels.length,
      active: labels.filter((l) => l.archivedAt === null).length,
      archived: labels.filter((l) => l.archivedAt !== null).length,
    }),
    [labels],
  );

  const handleArchiveToggle = async (label: Label) => {
    const next = label.archivedAt === null;
    updateLabelLocal(label.id, {
      archivedAt: next ? new Date().toISOString() : null,
    });
    try {
      const response = await updateLabel(label.id, { archived: next });
      updateLabelLocal(label.id, response.label);
      toast.success(next ? "Label archived" : "Label restored");
    } catch (error) {
      updateLabelLocal(label.id, { archivedAt: label.archivedAt });
      toast.error(error instanceof Error ? error.message : "Failed to update label");
    }
  };

  const handleColorChange = async (label: Label, color: string) => {
    const previous = label.color;
    updateLabelLocal(label.id, { color });
    try {
      const response = await updateLabel(label.id, { color });
      updateLabelLocal(label.id, response.label);
    } catch (error) {
      updateLabelLocal(label.id, { color: previous });
      toast.error(error instanceof Error ? error.message : "Failed to update color");
    }
  };

  const handleDelete = (label: Label) => {
    confirm({
      title: `Delete "${label.name}"?`,
      description: "It will be removed from all issues.",
      confirmLabel: "Delete label",
      destructive: true,
      onConfirm: async () => {
        removeLabelLocal(label.id);
        try {
          await deleteLabel(label.id);
          toast.success("Label deleted");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to delete label");
          void refresh();
        }
      },
    });
  };

  const handleRename = async (label: Label, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === label.name) return;
    const previous = label.name;
    updateLabelLocal(label.id, { name: trimmed });
    try {
      const response = await updateLabel(label.id, { name: trimmed });
      updateLabelLocal(label.id, response.label);
    } catch (error) {
      updateLabelLocal(label.id, { name: previous });
      toast.error(error instanceof Error ? error.message : "Failed to rename label");
    }
  };

  return (
    <main className="min-h-full bg-bg">
      {dialog}
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-fg-muted">
            <LabelsHeaderIcon />
          </span>
          <h1 className="text-sm font-medium text-fg">Labels</h1>
          <span className="text-xs text-fg-muted tabular-nums">{filtered.length}</span>
        </div>
        <NewLabelDialog onCreated={(label) => addLabel(label)} />
      </header>

      <nav className="flex items-center gap-1 border-b border-border-subtle bg-bg px-5 py-2">
        {(Object.keys(viewLabels) as ViewKey[]).map((key) => {
          const isActive = view === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
                isActive ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
              )}
            >
              <span>{viewLabels[key]}</span>
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  isActive ? "text-fg-muted" : "text-fg-faint",
                )}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </nav>

      <section className="mx-auto w-full max-w-[760px] px-5 py-6">
        {isLoading ? (
          <p className="text-[13px] text-fg-faint">Loading…</p>
        ) : labels.length === 0 ? (
          <EmptyState
            onCreate={(name) => {
              window.dispatchEvent(
                new CustomEvent("produktive:new-label", {
                  detail: { name },
                }),
              );
            }}
          />
        ) : filtered.length === 0 ? (
          <p className="text-[13px] text-fg-faint">
            No labels in {viewLabels[view].toLowerCase()}.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[10px] border border-border-subtle">
            {filtered.map((label, index) => (
              <li
                key={label.id}
                className={cn(
                  "group flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors",
                  index !== filtered.length - 1 && "border-b border-border-subtle",
                  label.archivedAt !== null && "opacity-60",
                )}
              >
                <ColorMenu
                  color={label.color}
                  onChange={(color) => void handleColorChange(label, color)}
                />
                <RenameField
                  initialValue={label.name}
                  onCommit={(name) => void handleRename(label, name)}
                />
                <span className="hidden min-w-0 flex-1 truncate text-[12px] text-fg-faint sm:inline">
                  {label.description ?? ""}
                </span>
                <span className="text-[11.5px] tabular-nums text-fg-faint">
                  {label.issueCount} issue{label.issueCount === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => void handleArchiveToggle(label)}
                    className="rounded-md px-2 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                  >
                    {label.archivedAt === null ? "Archive" : "Restore"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(label)}
                    className="rounded-md px-2 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ColorMenu({ color, onChange }: { color: string; onChange: (next: string) => void }) {
  return (
    <Select value={color} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Color"
        className="size-6 justify-center rounded-full border-0 bg-transparent p-0 hover:border-transparent hover:bg-surface [&>svg]:hidden"
      >
        <span
          aria-hidden
          className="size-2.5 rounded-full"
          style={{
            backgroundColor: labelColorHex[color] ?? labelColorHex.gray,
          }}
        />
      </SelectTrigger>
      <SelectContent align="start" className="min-w-32">
        {labelColorOptions.map((option) => (
          <SelectItem key={option} value={option}>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{
                  backgroundColor: labelColorHex[option] ?? labelColorHex.gray,
                }}
              />
              {option}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RenameField({
  initialValue,
  onCommit,
}: {
  initialValue: string;
  onCommit: (next: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          setEditing(false);
          onCommit(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            setEditing(false);
            onCommit(value);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
            setValue(initialValue);
          }
        }}
        className="w-44 rounded-md border border-border bg-bg px-2 py-0.5 text-[13px] text-fg outline-none focus:border-fg-muted"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-fg transition-colors hover:text-fg"
    >
      {initialValue}
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: (name?: string) => void }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-surface/60 text-fg-muted">
        <LabelsHeaderIcon size={22} />
      </div>
      <h2 className="text-[15px] font-medium text-fg">Tag issues with labels</h2>
      <p className="mt-1 max-w-[360px] text-[13px] text-fg-muted">
        Lightweight, free-form tags. Filter by them, attach as many as you want. Try one of these to
        get started:
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
        {exampleLabels.map((example) => (
          <button
            key={example.name}
            type="button"
            onClick={() => onCreate(example.name)}
            className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border-subtle bg-surface/40 px-2 text-[12px] text-fg-muted transition-colors hover:border-border hover:text-fg"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{
                backgroundColor: labelColorHex[example.color],
              }}
            />
            {example.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onCreate()}
        className="mt-5 rounded-md bg-fg px-3 py-1.5 text-[12.5px] font-medium text-bg transition-colors hover:bg-white"
      >
        + Create label
      </button>
    </div>
  );
}

function LabelsHeaderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7.5 1.5h4a1 1 0 011 1v4l-6 6a1 1 0 01-1.4 0L1.5 8.4a1 1 0 010-1.4l6-6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="4.5" r="0.9" fill="currentColor" />
    </svg>
  );
}
