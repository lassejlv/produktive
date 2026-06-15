import { useRef, useState, type DragEvent } from "react";
import { Eye, EyeOff, GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/cn";
import { monitorStatus, type Monitor, type StatusGroup } from "../../lib/types";
import { STATUS_COLOR } from "../../lib/status";

type Drag = { kind: "monitor"; id: string } | { kind: "group"; id: string };

interface Props {
  monitors: Monitor[];
  groups: StatusGroup[];
  onChange: (groups: StatusGroup[]) => void;
  /** Ids hidden from the public page. */
  hidden: Set<string>;
  onToggleHidden: (id: string) => void;
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return `g_${crypto.randomUUID().slice(0, 8)}`;
  return `g_${Math.random().toString(36).slice(2, 10)}`;
}

export function StatusBuilder({ monitors, groups, onChange, hidden, onToggleHidden }: Props) {
  const drag = useRef<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const byId = new Map(monitors.map((m) => [m.id, m]));
  const assigned = new Set(groups.flatMap((g) => g.monitor_ids));
  const pool = monitors.filter((m) => !assigned.has(m.id));

  function removeEverywhere(gs: StatusGroup[], mid: string): StatusGroup[] {
    return gs.map((g) => ({ ...g, monitor_ids: g.monitor_ids.filter((x) => x !== mid) }));
  }

  function moveMonitor(mid: string, toGroup: string | null, beforeMid: string | null) {
    let next = removeEverywhere(groups, mid);
    if (toGroup) {
      next = next.map((g) => {
        if (g.id !== toGroup) return g;
        const ids = g.monitor_ids.slice();
        const idx = beforeMid ? ids.indexOf(beforeMid) : -1;
        if (idx >= 0) ids.splice(idx, 0, mid);
        else ids.push(mid);
        return { ...g, monitor_ids: ids };
      });
    }
    onChange(next);
  }

  function reorderGroup(gid: string, beforeGid: string | null) {
    const arr = groups.slice();
    const from = arr.findIndex((g) => g.id === gid);
    if (from < 0) return;
    const [moved] = arr.splice(from, 1);
    let to = beforeGid ? arr.findIndex((g) => g.id === beforeGid) : arr.length;
    if (to < 0) to = arr.length;
    arr.splice(to, 0, moved);
    onChange(arr);
  }

  const startMonitor = (e: DragEvent, id: string) => {
    drag.current = { kind: "monitor", id };
    e.dataTransfer.effectAllowed = "move";
  };
  const startGroup = (e: DragEvent, id: string) => {
    drag.current = { kind: "group", id };
    e.dataTransfer.effectAllowed = "move";
  };
  const end = () => {
    drag.current = null;
    setOver(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div
          key={g.id}
          className={cn(
            "rounded-[var(--radius-lg)] border bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)] transition-colors",
            over === g.id ? "border-[var(--color-accent)]" : "border-[var(--color-border)]",
          )}
          onDragOver={(e) => {
            if (drag.current?.kind === "monitor") {
              e.preventDefault();
              setOver(g.id);
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setOver(null);
          }}
          onDrop={(e) => {
            if (drag.current?.kind === "monitor") {
              e.preventDefault();
              moveMonitor(drag.current.id, g.id, null);
            }
            end();
          }}
        >
          {/* group header */}
          <div
            className="flex items-center gap-2 px-2.5 h-11 border-b border-[var(--color-border)]"
            draggable
            onDragStart={(e) => startGroup(e, g.id)}
            onDragEnd={end}
            onDragOver={(e) => {
              if (drag.current?.kind === "group") {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onDrop={(e) => {
              if (drag.current?.kind === "group") {
                e.preventDefault();
                e.stopPropagation();
                reorderGroup(drag.current.id, g.id);
                end();
              }
            }}
          >
            <GripVertical size={15} className="text-[var(--color-fg-dim)] cursor-grab shrink-0" />
            <input
              value={g.name ?? ""}
              placeholder="Group name"
              onChange={(e) =>
                onChange(groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))
              }
              className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] font-medium tracking-tight text-[var(--color-fg)] placeholder:text-[var(--color-fg-dim)]"
            />
            <span className="mono tabular text-[11px] text-[var(--color-fg-dim)] shrink-0">
              {g.monitor_ids.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onChange(groups.filter((x) => x.id !== g.id))}
              className="shrink-0 text-[var(--color-fg-dim)] hover:text-[var(--color-err)] hover:bg-[var(--color-bg-row)]"
              title="Delete group"
            >
              <Trash2 size={13} />
            </Button>
          </div>

          {/* group body */}
          <div className="p-2 flex flex-col gap-1 min-h-[46px]">
            {g.monitor_ids.length === 0 && (
              <div className="text-[12px] text-[var(--color-fg-dim)] text-center py-2.5">
                Drag monitors here
              </div>
            )}
            {g.monitor_ids.map((mid) => {
              const m = byId.get(mid);
              if (!m) return null;
              return (
                <MonitorItem
                  key={mid}
                  m={m}
                  hidden={hidden.has(mid)}
                  onToggleHidden={() => onToggleHidden(mid)}
                  onDragStart={(e) => startMonitor(e, mid)}
                  onDragEnd={end}
                  onDrop={(e) => {
                    if (drag.current?.kind === "monitor") {
                      e.preventDefault();
                      e.stopPropagation();
                      moveMonitor(drag.current.id, g.id, mid);
                    }
                    end();
                  }}
                  onRemove={() => moveMonitor(mid, null, null)}
                />
              );
            })}
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...groups, { id: newId(), name: "New group", monitor_ids: [] }])}
        className="self-start border-dashed border-[var(--color-border-hi)] text-[12px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-border-strong)]"
      >
        <Plus size={13} /> Add group
      </Button>

      {/* unassigned pool */}
      <div
        className={cn(
          "rounded-[var(--radius-lg)] border border-dashed p-3 transition-colors",
          over === "pool" ? "border-[var(--color-accent)]" : "border-[var(--color-border-hi)]",
        )}
        onDragOver={(e) => {
          if (drag.current?.kind === "monitor") {
            e.preventDefault();
            setOver("pool");
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setOver(null);
        }}
        onDrop={(e) => {
          if (drag.current?.kind === "monitor") {
            e.preventDefault();
            moveMonitor(drag.current.id, null, null);
          }
          end();
        }}
      >
        <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-[var(--color-fg-dim)] mb-2 px-1">
          Unassigned · {pool.length}
        </div>
        {pool.length === 0 ? (
          <div className="text-[12px] text-[var(--color-fg-dim)] px-1 py-1">
            All monitors are grouped.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {pool.map((m) => {
              const isHidden = hidden.has(m.id);
              return (
                <span
                  key={m.id}
                  draggable
                  onDragStart={(e) => startMonitor(e, m.id)}
                  onDragEnd={end}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[12px] cursor-grab active:cursor-grabbing",
                    isHidden && "opacity-50",
                  )}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: STATUS_COLOR[monitorStatus(m)] }}
                  />
                  <span className="truncate max-w-[160px] text-[var(--color-fg)]">{m.name}</span>
                  <VisibilityToggle hidden={isHidden} onToggle={() => onToggleHidden(m.id)} />
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MonitorItem({
  m,
  hidden,
  onToggleHidden,
  onDragStart,
  onDragEnd,
  onDrop,
  onRemove,
}: {
  m: Monitor;
  hidden: boolean;
  onToggleHidden: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent) => void;
  onRemove: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={cn(
        "group flex items-center gap-2 h-9 px-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-row)] cursor-grab active:cursor-grabbing",
        hidden && "opacity-50",
      )}
    >
      <GripVertical size={14} className="text-[var(--color-fg-dim)] shrink-0" />
      <span
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: STATUS_COLOR[monitorStatus(m)] }}
      />
      <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--color-fg)]">{m.name}</span>
      <VisibilityToggle hidden={hidden} onToggle={onToggleHidden} />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-[var(--color-fg-dim)] hover:text-[var(--color-err)]"
        title="Unassign"
      >
        <X size={13} />
      </Button>
    </div>
  );
}

/** Toggles whether a component appears on the public status page. */
function VisibilityToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={onToggle}
      className={cn(
        "shrink-0 hover:bg-[var(--color-bg-row)]",
        hidden
          ? "text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]"
          : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
      )}
      title={hidden ? "Hidden from status page — click to show" : "Visible — click to hide"}
      aria-pressed={hidden}
    >
      {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
    </Button>
  );
}
