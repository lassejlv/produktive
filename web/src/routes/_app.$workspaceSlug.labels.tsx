import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { NewLabelSheet } from "@/components/label/new-label-sheet";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
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

export const Route = createFileRoute("/_app/$workspaceSlug/labels")({
  component: LabelsPage,
});

function LabelsPage() {
  const _navigate = useNavigate();
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

  const total = counts.all;
  const heroLabel = total === 1 ? "1 label" : `${total} labels`;

  return (
    <main className="min-h-full bg-bg">
      {dialog}
      <header className="sticky top-0 z-10 flex h-11 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-4 backdrop-blur">
        <h1 className="text-sm font-medium text-fg">Labels</h1>
        <NewLabelSheet onCreated={(label) => addLabel(label)} />
      </header>

      <section className="mx-auto w-full max-w-2xl animate-fade-up px-4 pb-16 pt-12">
        <div>
          <h2 className="text-4xl font-light leading-[1.05] tracking-tight text-fg sm:text-5xl">
            {heroLabel}
          </h2>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-fg-faint">
            <span>
              <span className="tabular-nums text-fg-muted">{counts.active}</span> active
            </span>
            <span>
              <span className="tabular-nums text-fg-muted">{counts.archived}</span> archived
            </span>
          </div>
        </div>

        <nav className="mt-8 flex flex-wrap gap-1">
          {(Object.keys(viewLabels) as ViewKey[]).map((key) => {
            const isActive = view === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition-colors",
                  isActive
                    ? "bg-surface text-fg"
                    : "text-fg-muted hover:bg-surface/60 hover:text-fg",
                )}
              >
                <span>{viewLabels[key]}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    isActive ? "text-fg-muted" : "text-fg-faint",
                  )}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="mt-10">
          <div className="hairline-top mb-3" />
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-medium text-fg-muted">{viewLabels[view]}</h3>
            <span className="text-[11px] tabular-nums text-fg-faint">{filtered.length}</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10 text-fg-faint">
              <Spinner size={14} />
            </div>
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
            <p className="py-4 text-sm text-fg-faint">
              No labels in {viewLabels[view].toLowerCase()}.
            </p>
          ) : (
            <ul className="-mx-2 flex flex-col animate-stagger">
              {filtered.map((label, idx) => (
                <li key={label.id} style={{ "--i": idx } as React.CSSProperties}>
                  <LabelRow
                    label={label}
                    onColorChange={(color) => void handleColorChange(label, color)}
                    onRename={(name) => void handleRename(label, name)}
                    onArchiveToggle={() => void handleArchiveToggle(label)}
                    onDelete={() => handleDelete(label)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function LabelRow({
  label,
  onColorChange,
  onRename,
  onArchiveToggle,
  onDelete,
}: {
  label: Label;
  onColorChange: (color: string) => void;
  onRename: (name: string) => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "row-hover-shift group flex items-center gap-3 rounded-md px-2 py-2 text-[13px]",
        label.archivedAt !== null && "opacity-60",
      )}
    >
      <ColorMenu color={label.color} onChange={onColorChange} />
      <RenameField initialValue={label.name} onCommit={onRename} />
      <span className="hidden min-w-0 flex-1 truncate text-[12px] text-fg-faint sm:inline">
        {label.description ?? ""}
      </span>
      <span className="shrink-0 text-[11.5px] tabular-nums text-fg-faint">
        {label.issueCount} issue{label.issueCount === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={onArchiveToggle}
          className="rounded-md px-2 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:bg-surface/60 hover:text-fg"
        >
          {label.archivedAt === null ? "Archive" : "Restore"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md px-2 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ColorMenu({ color, onChange }: { color: string; onChange: (next: string) => void }) {
  return (
    <Select value={color} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Color"
        className="size-6 justify-center rounded-full border-0 bg-transparent p-0 hover:border-transparent hover:bg-surface/60 [&>svg]:hidden"
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
        className="w-44 rounded-md border border-border-subtle bg-surface/40 px-2 py-0.5 text-[13px] text-fg outline-none transition-colors focus:border-accent/60 focus:bg-surface focus:ring-2 focus:ring-accent/30"
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
      <h2 className="text-sm text-fg">Tag issues with labels</h2>
      <p className="mt-1 max-w-[360px] text-[13px] text-fg-muted">
        Lightweight, free-form tags. Filter by them, attach as many as you want. Try one of these
        to get started:
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
        className="mt-5 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        Create label →
      </button>
    </div>
  );
}
