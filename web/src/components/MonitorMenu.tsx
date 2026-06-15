import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ExternalLink, MoreVertical, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/cn";
import type { Monitor } from "../lib/types";
import { useDeleteMonitor, useUpdateMonitor } from "../lib/queries";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  monitor: Monitor;
  /** Stops mousedown propagation so the menu works inside a draggable canvas node. */
  canvas?: boolean;
}

export function MonitorMenu({ monitor, canvas }: Props) {
  const { wid } = useParams({ from: "/_authed/$wid" });
  const nav = useNavigate();
  const mid = monitor.slug || monitor.id;
  const menuId = useId();
  const [menu, setMenu] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const update = useUpdateMonitor(wid);
  const del = useDeleteMonitor(wid);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menu]);

  const stop = canvas
    ? {
        onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
      }
    : {};

  return (
    <div className="relative" ref={ref} {...stop}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-row)]"
        aria-label="Monitor actions"
        aria-expanded={menu}
        aria-haspopup="menu"
        aria-controls={menu ? menuId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu((v) => !v);
        }}
      >
        <MoreVertical size={14} />
      </Button>

      {menu && (
        <div
          id={menuId}
          role="menu"
          className="absolute z-30 right-0 top-8 min-w-[180px] border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-lg)] py-1 fade-in"
        >
          <Link
            to="/$wid/monitors/$mid"
            params={{ wid, mid }}
            role="menuitem"
            className="flex items-center gap-2 px-3 h-8 text-[13px] text-[var(--color-fg)] hover:bg-[var(--color-bg-row)] no-underline"
            onClick={() => setMenu(false)}
          >
            <ExternalLink size={12} className="text-[var(--color-fg-muted)]" /> Open detail
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault();
              update.mutate(
                { id: monitor.id, patch: { enabled: !monitor.enabled } },
                {
                  onSuccess: () =>
                    toast.success(monitor.enabled ? "Monitor paused" : "Monitor resumed"),
                  onError: (err) => toast.error((err as Error).message),
                },
              );
              setMenu(false);
            }}
            className="h-8 w-full justify-start px-3 text-[13px] text-[var(--color-fg)] hover:bg-[var(--color-bg-row)]"
          >
            {monitor.enabled ? (
              <Pause size={12} className="text-[var(--color-fg-muted)]" />
            ) : (
              <Play size={12} className="text-[var(--color-fg-muted)]" />
            )}
            {monitor.enabled ? "Pause" : "Resume"}
          </Button>
          <div className="h-px my-1 bg-[var(--color-border)]" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault();
              setMenu(false);
              setConfirmOpen(true);
            }}
            className={cn(
              "h-8 w-full justify-start px-3 text-[13px] text-[var(--color-err)]",
              "hover:bg-[color-mix(in_srgb,var(--color-err)_8%,transparent)]",
            )}
          >
            <Trash2 size={12} /> Delete
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${monitor.name}"?`}
        description="This monitor and its check history will be permanently removed. This cannot be undone."
        confirmLabel="Delete monitor"
        destructive
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(monitor.id, {
            onSuccess: () => {
              toast.success("Monitor deleted");
              setConfirmOpen(false);
              void nav({ to: "/$wid/monitors", params: { wid } });
            },
            onError: (e) => toast.error((e as Error).message),
          })
        }
      />
    </div>
  );
}
