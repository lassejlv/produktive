import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import { KeyRound, Plus, Rocket, Search, X } from "lucide-react";
import { toast } from "#/lib/toast";
import { cn } from "#/lib/cn";
import { DEPLOYMENTS_ENABLED } from "#/lib/features";
import {
  type DeployDetailTab,
  type DeployServiceFilter,
  type DeploymentsSearch,
  deployServiceFilterBucket,
  deploymentsSearchWithoutService,
  matchesDeploySearch,
  openServiceSearch,
  parseDeploymentsSearch,
} from "#/lib/deployments";
import { DEPLOY_STATUS_COLOR } from "#/lib/status";
import { Button } from "#/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "#/components/ui/input-group";
import { DeployServiceCard } from "../components/DeployServiceCard";
import { DeployServiceSheet } from "../components/deployments/DeployServiceSheet";
import { EmptyState } from "../components/EmptyState";
import {
  CreateCredentialDialog,
  CreateServiceDialog,
  RequestAccessOverlay,
} from "./_authed.$wid.deployments";
import {
  deployAccessQuery,
  useCreateDeployCredential,
  useCreateDeployService,
  useDeployAccess,
  useDeployCredentials,
  useDeployRegions,
  useDeployServices,
  useUpdateDeployService,
} from "../lib/queries";
import type { DeployService } from "../lib/types";

const deploymentsIndexRoute = getRouteApi("/_authed/$wid/deployments/");

export const Route = createFileRoute("/_authed/$wid/deployments/")({
  staticData: {
    title: "Deployments",
    description: "Private-preview Docker services with Fly-backed runtime, logs, and metrics.",
    layout: "bleed",
  },
  validateSearch: parseDeploymentsSearch,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(deployAccessQuery(params.wid)),
  component: DeploymentsCanvas,
});

function DeploymentsCanvas() {
  if (!DEPLOYMENTS_ENABLED) {
    return (
      <EmptyState
        icon={Rocket}
        title="Deployments not available"
        description="Docker deployments are not enabled in this build."
      />
    );
  }

  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}

type ServiceNodeData = { service: DeployService };
type SNode = Node<ServiceNodeData>;

function Canvas() {
  const { wid } = Route.useParams();
  const search = Route.useSearch();
  const navigate = deploymentsIndexRoute.useNavigate();
  const access = useDeployAccess(wid);
  const approved = access.data?.status === "approved";
  const { data: services = [], isLoading } = useDeployServices(wid, approved);
  const credentials = useDeployCredentials(wid, approved);
  const deployRegions = useDeployRegions(wid, approved);
  const regions = deployRegions.data ?? [];
  const update = useUpdateDeployService(wid);
  const createService = useCreateDeployService(wid);
  const createCredential = useCreateDeployCredential(wid);
  const draggingRef = useRef(false);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [serviceOpen, setServiceOpen] = useState(false);
  const [credentialOpen, setCredentialOpen] = useState(false);

  const filter = search.status ?? "all";
  const query = search.q ?? "";
  const selectedTab = search.tab ?? "deployments";

  const selectedService = useMemo(
    () => (search.service ? services.find((service) => service.id === search.service) ?? null : null),
    [services, search.service],
  );

  const openService = useCallback(
    (serviceId: string, tab?: DeployDetailTab) => {
      void navigate({
        to: "/$wid/deployments",
        params: { wid },
        search: (prev) => openServiceSearch(prev, serviceId, tab),
      });
    },
    [navigate, wid],
  );

  const closeService = useCallback(() => {
    void navigate({
      to: "/$wid/deployments",
      params: { wid },
      search: (prev) => deploymentsSearchWithoutService(prev),
      replace: true,
    });
  }, [navigate, wid]);

  const setTab = useCallback(
    (tab: DeployDetailTab) => {
      void navigate({
        to: "/$wid/deployments",
        params: { wid },
        search: (prev) => ({
          ...prev,
          tab: tab === "deployments" ? undefined : tab,
        }),
        replace: true,
      });
    },
    [navigate, wid],
  );

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      if (draggingRef.current) return;
      openService(node.id);
    },
    [openService],
  );

  const shown = useMemo(() => {
    return services.filter((service) => {
      const bucket = deployServiceFilterBucket(service.status);
      const statusMatch = filter === "all" || bucket === filter;
      return statusMatch && matchesDeploySearch(service, query);
    });
  }, [services, filter, query]);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<SNode>([]);

  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((node) => [node.id, node]));
      let i = 0;
      return shown.map((service) => {
        const existing = prevById.get(service.id);
        const position = existing
          ? existing.position
          : {
              x: service.canvas_x || (i % 4) * 320 + 60,
              y: service.canvas_y || Math.floor(i / 4) * 200 + 60,
            };
        i += 1;
        return {
          id: service.id,
          type: "service",
          position,
          data: { service },
          draggable: true,
        } satisfies SNode;
      });
    });
  }, [shown, setNodes]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const setSearch = (patch: Partial<DeploymentsSearch>) => {
    void navigate({
      to: "/$wid/deployments",
      params: { wid },
      search: (prev) => ({
        ...prev,
        q: "q" in patch ? patch.q : prev.q,
        status:
          "status" in patch
            ? patch.status === "all"
              ? undefined
              : patch.status
            : prev.status,
      }),
      replace: true,
    });
  };

  const onNodesChange = useCallback(
    (changes: NodeChange<SNode>[]) => {
      onNodesChangeBase(changes);
      for (const change of changes) {
        if (change.type === "position") {
          if (change.dragging) draggingRef.current = true;
          if (change.dragging === false) {
            draggingRef.current = false;
            if (!change.position) continue;
            const id = change.id;
            const x = Math.round(change.position.x);
            const y = Math.round(change.position.y);
            const existing = saveTimers.current.get(id);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(() => {
              saveTimers.current.delete(id);
              update.mutate(
                { serviceId: id, canvas_x: x, canvas_y: y },
                {
                  onError: (err) =>
                    toast.error((err as Error).message || "Could not save canvas position"),
                },
              );
            }, 200);
            saveTimers.current.set(id, timer);
          }
        }
      }
    },
    [onNodesChangeBase, update],
  );

  if (!approved) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <EmptyCanvasPlaceholder />
        {access.isSuccess && (
          <RequestAccessOverlay wid={wid} status={access.data.status} />
        )}
      </div>
    );
  }

  if (!isLoading && services.length === 0) {
    return (
      <>
        <EmptyCanvas onCreate={() => setServiceOpen(true)} />
        <CreateCredentialDialog
          open={credentialOpen}
          pending={createCredential.isPending}
          onOpenChange={(open) => {
            if (!open && createCredential.isPending) return;
            setCredentialOpen(open);
          }}
          onSubmit={(body) =>
            createCredential.mutate(body, {
              onSuccess: () => {
                toast.success("Registry credential saved");
                setCredentialOpen(false);
              },
              onError: (err) => toast.error((err as Error).message),
            })
          }
        />
        <CreateServiceDialog
          open={serviceOpen}
          credentials={credentials.data ?? []}
          regions={regions}
          pending={createService.isPending}
          onOpenChange={(open) => {
            if (!open && createService.isPending) return;
            setServiceOpen(open);
          }}
          onSubmit={(body) =>
            createService.mutate(body, {
              onSuccess: (service) => {
                toast.success("Service created");
                setServiceOpen(false);
                openService(service.id);
              },
              onError: (err) => toast.error((err as Error).message),
            })
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <CanvasToolbar
          services={services}
          filter={filter}
          query={query}
          shown={shown.length}
          approved={approved}
          onFilter={(status) => setSearch({ status })}
          onQueryChange={(q) => setSearch({ q: q || undefined })}
          onClearFilters={() => setSearch({ q: undefined, status: "all" })}
          onCreate={() => setServiceOpen(true)}
          onCredential={() => setCredentialOpen(true)}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 hidden text-center text-[11px] text-[var(--color-canvas-dim)] md:block">
          Drag cards to arrange · drag the background to pan · click a card to open it
        </div>
        <ReactFlow
          nodes={nodes}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
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

      <CreateCredentialDialog
        open={credentialOpen}
        pending={createCredential.isPending}
        onOpenChange={(open) => {
          if (!open && createCredential.isPending) return;
          setCredentialOpen(open);
        }}
        onSubmit={(body) =>
          createCredential.mutate(body, {
            onSuccess: () => {
              toast.success("Registry credential saved");
              setCredentialOpen(false);
            },
            onError: (err) => toast.error((err as Error).message),
          })
        }
      />

      <CreateServiceDialog
        open={serviceOpen}
        credentials={credentials.data ?? []}
        regions={regions}
        pending={createService.isPending}
        onOpenChange={(open) => {
          if (!open && createService.isPending) return;
          setServiceOpen(open);
        }}
        onSubmit={(body) =>
          createService.mutate(body, {
            onSuccess: (service) => {
              toast.success("Service created");
              setServiceOpen(false);
              openService(service.id);
            },
            onError: (err) => toast.error((err as Error).message),
          })
        }
      />

      <DeployServiceSheet
        open={Boolean(selectedService)}
        wid={wid}
        service={selectedService}
        tab={selectedTab}
        onClose={closeService}
        onTabChange={setTab}
      />
    </>
  );
}

function CanvasToolbar({
  services,
  filter,
  query,
  shown,
  approved,
  onFilter,
  onQueryChange,
  onClearFilters,
  onCreate,
  onCredential,
}: {
  services: DeployService[];
  filter: DeployServiceFilter;
  query: string;
  shown: number;
  approved: boolean;
  onFilter: (filter: DeployServiceFilter) => void;
  onQueryChange: (query: string) => void;
  onClearFilters: () => void;
  onCreate: () => void;
  onCredential: () => void;
}) {
  const counts = useMemo(() => {
    const tallies = { all: services.length, live: 0, deploying: 0, failed: 0, stopped: 0 };
    for (const service of services) {
      const bucket = deployServiceFilterBucket(service.status);
      if (bucket !== "all") tallies[bucket] += 1;
    }
    return tallies;
  }, [services]);

  const pills: Array<{ value: DeployServiceFilter; label: string; n: number; color?: string }> = [
    { value: "all", label: "All", n: counts.all },
    { value: "live", label: "Live", n: counts.live, color: DEPLOY_STATUS_COLOR.live },
    { value: "deploying", label: "Deploying", n: counts.deploying, color: DEPLOY_STATUS_COLOR.starting },
    { value: "failed", label: "Failed", n: counts.failed, color: DEPLOY_STATUS_COLOR.failed },
    { value: "stopped", label: "Stopped", n: counts.stopped },
  ];

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
      <div className="pointer-events-auto flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-1.5">
          {pills.map((pill) => {
            const active = filter === pill.value;
            return (
              <Button
                key={pill.value}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onFilter(active && pill.value !== "all" ? "all" : pill.value)}
                className={cn(
                  "h-[30px] rounded-full px-3 text-[12px] font-medium shadow-none",
                  active
                    ? "border-[var(--color-canvas-border-hi)] bg-[var(--color-canvas-surface)] text-[var(--color-canvas-fg)] shadow-[var(--shadow-md)]"
                    : "border-transparent bg-[color-mix(in_srgb,var(--color-canvas-surface)_75%,transparent)] text-[var(--color-canvas-muted)] hover:text-[var(--color-canvas-fg)]",
                )}
              >
                {pill.color && (
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: pill.color }} />
                )}
                {pill.label}
                <span className="tabular text-[11px] text-[var(--color-canvas-dim)]">{pill.n}</span>
              </Button>
            );
          })}
        </div>
        <InputGroup className="h-[30px] max-w-xs rounded-full border-[var(--color-canvas-border)] bg-[color-mix(in_srgb,var(--color-canvas-surface)_75%,transparent)] shadow-none">
          <InputGroupAddon>
            <Search size={13} className="text-[var(--color-canvas-dim)]" />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search services…"
            className="text-[12px] text-[var(--color-canvas-fg)] placeholder:text-[var(--color-canvas-dim)]"
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Clear search"
                onClick={() => onQueryChange("")}
                className="text-[var(--color-canvas-muted)] hover:text-[var(--color-canvas-fg)]"
              >
                <X size={12} />
              </Button>
            </InputGroupAddon>
          )}
        </InputGroup>
        {shown === 0 && services.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-[30px] rounded-full text-[12px] text-[var(--color-canvas-muted)] hover:text-[var(--color-canvas-fg)]"
          >
            Clear filters
          </Button>
        )}
      </div>
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
        <span className="tabular rounded-full bg-[color-mix(in_srgb,var(--color-canvas-surface)_75%,transparent)] px-2.5 py-1 text-[12px] text-[var(--color-canvas-muted)]">
          {shown} shown
        </span>
        {approved && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCredential}
              className="h-[30px] rounded-full border-transparent bg-[color-mix(in_srgb,var(--color-canvas-surface)_75%,transparent)] text-[12px] text-[var(--color-canvas-muted)] hover:text-[var(--color-canvas-fg)]"
            >
              <KeyRound size={13} /> Credential
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onCreate}
              className="h-[30px] rounded-full px-3 text-[12px]"
            >
              <Plus size={13} /> New service
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

const ServiceNode = memo(function ServiceNode(props: NodeProps) {
  const service = (props.data as ServiceNodeData).service;
  return <DeployServiceCard service={service} canvas />;
});

const NODE_TYPES = { service: ServiceNode };

function EmptyCanvasPlaceholder() {
  return (
    <div className="flex flex-1 items-center justify-center overflow-hidden bg-[var(--color-canvas-bg)] opacity-35 blur-[2px]">
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: "radial-gradient(circle, var(--color-canvas-dot) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
    </div>
  );
}

function EmptyCanvas({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--color-canvas-bg)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(800px circle at 50% 30%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: "radial-gradient(circle, var(--color-canvas-dot) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="fade-in relative z-10 max-w-[420px] px-6 text-center">
        <div
          className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--color-accent) 30%, transparent), transparent 70%)",
          }}
        >
          <Rocket
            size={20}
            className="text-[var(--color-accent)]"
            style={{ filter: "drop-shadow(0 0 12px color-mix(in srgb, var(--color-accent) 60%, transparent))" }}
          />
        </div>
        <h2 className="mb-2 text-[20px] font-medium tracking-tight text-[var(--color-canvas-fg)]">
          No services yet
        </h2>
        <p className="mb-7 text-[13.5px] leading-relaxed text-[var(--color-canvas-muted)]">
          Create an HTTP service from a Docker image to start deploying on Fly.
        </p>
        <Button variant="default" size="lg" onClick={onCreate}>
          <Plus size={14} /> New service
        </Button>
      </div>
    </div>
  );
}
