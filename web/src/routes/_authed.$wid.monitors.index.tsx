import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "#/lib/toast";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { cn } from "#/lib/cn";
import { MonitorCard } from "../components/MonitorCard";
import { monitorStatus, type Monitor, type MonitorStatus } from "../lib/types";
import { STATUS_COLOR } from "../lib/status";
import { monitorsQuery, useMonitors, useUpdateMonitor } from "../lib/queries";
import { Plus } from "lucide-react";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/_authed/$wid/monitors/")({
  staticData: {
    title: "Monitors",
    layout: "bleed",
    primaryAction: { label: "New monitor", to: "/$wid/monitors/new", icon: Plus },
  },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(monitorsQuery(params.wid)),
  component: MonitorsCanvas,
});

function MonitorsCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}

type MonitorNodeData = { monitor: Monitor };
type MNode = Node<MonitorNodeData>;

type CanvasFilter = "all" | MonitorStatus;

function Canvas() {
  const { wid } = Route.useParams();
  const nav = useNavigate();
  const { data: monitors = [] } = useMonitors(wid);
  const update = useUpdateMonitor(wid);
  const draggingRef = useRef(false);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [filter, setFilter] = useState<CanvasFilter>("all");

  const shown = useMemo(
    () => (filter === "all" ? monitors : monitors.filter((m) => monitorStatus(m) === filter)),
    [monitors, filter],
  );

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<MNode>([]);

  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      let i = 0;
      return shown.map((m) => {
        const existing = prevById.get(m.id);
        const pos = existing
          ? existing.position
          : {
              x: m.canvas_x || (i % 4) * 320 + 60,
              y: m.canvas_y || Math.floor(i / 4) * 200 + 60,
            };
        i++;
        return {
          id: m.id,
          type: "monitor",
          position: pos,
          data: { monitor: m },
          draggable: true,
        } satisfies MNode;
      });
    });
  }, [shown, setNodes]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<MNode>[]) => {
      onNodesChangeBase(changes);
      for (const c of changes) {
        if (c.type === "position") {
          if (c.dragging) draggingRef.current = true;
          if (c.dragging === false && c.position) {
            draggingRef.current = false;
            const id = c.id;
            const x = Math.round(c.position.x);
            const y = Math.round(c.position.y);
            const existing = saveTimers.current.get(id);
            if (existing) clearTimeout(existing);
            const t = setTimeout(() => {
              saveTimers.current.delete(id);
              update.mutate(
                { id, patch: { canvas_x: x, canvas_y: y } },
                {
                  onError: (err) =>
                    toast.error((err as Error).message || "Could not save canvas position"),
                },
              );
            }, 200);
            saveTimers.current.set(id, t);
          }
        }
      }
    },
    [onNodesChangeBase, update],
  );

  if (monitors.length === 0) {
    return <EmptyCanvas onCreate={() => nav({ to: "/$wid/monitors/new", params: { wid } })} />;
  }

  return (
    <div className="flex-1 min-h-0 relative">
      <CanvasToolbar
        monitors={monitors}
        filter={filter}
        onFilter={setFilter}
        shown={shown.length}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 hidden text-center text-[11px] text-[var(--color-canvas-dim)] md:block">
        Drag cards to arrange · drag the background to pan · click a card to open it
      </div>
      <ReactFlow
        nodes={nodes}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        snapToGrid
        snapGrid={[24, 24]}
        minZoom={0.4}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        panOnDrag={[1, 2]}
        selectionOnDrag
        panOnScroll
        zoomOnPinch
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        edgesFocusable={false}
        nodeDragThreshold={1}
        elevateNodesOnSelect={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

/** Floating status filter pills + shown count over the canvas viewport. */
function CanvasToolbar({
  monitors,
  filter,
  onFilter,
  shown,
}: {
  monitors: Monitor[];
  filter: CanvasFilter;
  onFilter: (f: CanvasFilter) => void;
  shown: number;
}) {
  const counts = monitors.reduce(
    (acc, m) => {
      acc[monitorStatus(m)] += 1;
      return acc;
    },
    { up: 0, down: 0, degraded: 0, unknown: 0 },
  );
  const pills: { value: CanvasFilter; label: string; n: number }[] = [
    { value: "all", label: "All", n: monitors.length },
    { value: "down", label: "Down", n: counts.down },
    { value: "degraded", label: "Degraded", n: counts.degraded },
    { value: "up", label: "Up", n: counts.up },
  ];

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
        {pills.map((p) => {
          const active = filter === p.value;
          return (
            <Button
              key={p.value}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onFilter(p.value)}
              className={cn(
                "h-[30px] rounded-full px-3 text-[12px] font-medium shadow-none",
                active
                  ? "border-[var(--color-canvas-border-hi)] bg-[var(--color-canvas-surface)] text-[var(--color-canvas-fg)] shadow-[var(--shadow-md)]"
                  : "border-transparent bg-[color-mix(in_srgb,var(--color-canvas-surface)_75%,transparent)] text-[var(--color-canvas-muted)] hover:text-[var(--color-canvas-fg)]",
              )}
            >
              {p.value !== "all" && (
                <span
                  className="h-[7px] w-[7px] rounded-full"
                  style={{ background: STATUS_COLOR[p.value] }}
                />
              )}
              {p.label}
              <span className="tabular text-[11px] text-[var(--color-canvas-dim)]">{p.n}</span>
            </Button>
          );
        })}
      </div>
      <span className="pointer-events-auto tabular rounded-full bg-[color-mix(in_srgb,var(--color-canvas-surface)_75%,transparent)] px-2.5 py-1 text-[12px] text-[var(--color-canvas-muted)]">
        {shown} shown
      </span>
    </div>
  );
}

const MonitorNode = memo(function MonitorNode(props: NodeProps) {
  const { data } = props;
  const monitor = (data as MonitorNodeData).monitor;
  return <MonitorCard monitor={monitor} canvas />;
});

const NODE_TYPES = { monitor: MonitorNode };

function EmptyCanvas({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-[var(--color-canvas-bg)]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(800px circle at 50% 30%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: "radial-gradient(circle, var(--color-canvas-dot) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="text-center relative z-10 max-w-[420px] px-6 fade-in">
        <div
          className="mx-auto mb-6 w-12 h-12 rounded-full flex items-center justify-center"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--color-accent) 30%, transparent), transparent 70%)",
          }}
        >
          <span
            className="w-2.5 h-2.5 rounded-full pulse-dot"
            style={{
              background: "var(--color-accent)",
              boxShadow: "0 0 18px color-mix(in srgb, var(--color-accent) 70%, transparent)",
            }}
          />
        </div>
        <h2 className="text-[20px] tracking-tight font-medium mb-2 text-[var(--color-canvas-fg)]">
          No monitors yet
        </h2>
        <p className="text-[var(--color-canvas-muted)] text-[13.5px] mb-7 leading-relaxed">
          Add your first endpoint and Produktive will start pinging it on the interval you choose.
        </p>
        <Button variant="default" size="lg" onClick={onCreate}>
          <Plus size={14} /> New monitor
        </Button>
      </div>
    </div>
  );
}
