import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import { Plus, Rocket } from "lucide-react";
import { toast } from "#/lib/toast";
import { DEPLOYMENTS_ENABLED } from "#/lib/features";
import {
  type DeployDetailTab,
  DEFAULT_DEPLOY_DETAIL_TAB,
  deploymentsSearchWithoutService,
  openServiceSearch,
  parseDeploymentsSearch,
} from "#/lib/deployments";
import { Button } from "#/components/ui/button";
import { DeployServiceCard } from "../components/DeployServiceCard";
import { DeployServiceRail } from "../components/deployments/DeployServiceRail";
import { EmptyState } from "../components/EmptyState";
import {
  CreateServiceDialog,
  RequestAccessOverlay,
} from "./_authed.$wid.deployments";
import {
  deployAccessQuery,
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

/** Card dimensions — keep in sync with DeployServiceCard canvas tile. */
const CANVAS_CARD_WIDTH = 212;
const CANVAS_CARD_HEIGHT = 56;

function CanvasViewportSync({
  serviceId,
  railOpen,
  nodesReady,
}: {
  serviceId: string | null;
  railOpen: boolean;
  nodesReady: boolean;
}) {
  const { getNode, setCenter, getZoom, fitView } = useReactFlow();
  const prevServiceId = useRef<string | null>(null);
  const initialFitDone = useRef(false);

  useEffect(() => {
    if (!nodesReady || serviceId || initialFitDone.current) return;
    initialFitDone.current = true;
    fitView({ padding: 0.22, maxZoom: 1, duration: 0 });
  }, [nodesReady, serviceId, fitView]);

  useEffect(() => {
    if (!serviceId) {
      if (prevServiceId.current) {
        fitView({ padding: 0.22, maxZoom: 1, duration: 450 });
      }
      prevServiceId.current = null;
      return;
    }

    const focusNode = () => {
      const node = getNode(serviceId);
      if (!node) return;
      const zoom = Math.min(getZoom(), 1);
      const cx = node.position.x + CANVAS_CARD_WIDTH / 2;
      const cy = node.position.y + CANVAS_CARD_HEIGHT / 2;
      setCenter(cx, cy, { zoom, duration: 450 });
    };

    prevServiceId.current = serviceId;
    const delay = railOpen ? 300 : 60;
    const timer = setTimeout(focusNode, delay);
    return () => clearTimeout(timer);
  }, [serviceId, railOpen, getNode, setCenter, getZoom, fitView]);

  return null;
}

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
  const draggingRef = useRef(false);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [serviceOpen, setServiceOpen] = useState(false);

  const selectedTab = search.tab ?? DEFAULT_DEPLOY_DETAIL_TAB;

  const selectedService = useMemo(
    () =>
      search.service ? (services.find((service) => service.id === search.service) ?? null) : null,
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
          tab: tab === DEFAULT_DEPLOY_DETAIL_TAB ? undefined : tab,
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

  const shown = services;

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
              x: service.canvas_x || (i % 5) * 248 + 48,
              y: service.canvas_y || Math.floor(i / 5) * 96 + 48,
            };
        i += 1;
        return {
          id: service.id,
          type: "service",
          position,
          data: { service },
          draggable: true,
          selected: service.id === search.service,
        } satisfies SNode;
      });
    });
  }, [shown, setNodes, search.service]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

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
        {access.isSuccess && <RequestAccessOverlay wid={wid} status={access.data.status} />}
      </div>
    );
  }

  if (!isLoading && services.length === 0) {
    return (
      <>
        <EmptyCanvas onCreate={() => setServiceOpen(true)} />
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row md:items-start">
        <div
          className="relative min-h-0 min-w-0 flex-1 transition-[flex] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          {!selectedService && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 hidden text-center text-[11px] text-[var(--color-canvas-dim)] md:block">
              Drag cards to arrange · drag the background to pan · click a card to open it
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            snapToGrid
            snapGrid={[24, 24]}
            minZoom={0.4}
            maxZoom={2}
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
            <CanvasViewportSync
              serviceId={search.service ?? null}
              railOpen={!!selectedService}
              nodesReady={nodes.length > 0}
            />
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
            <Controls position="bottom-left" showInteractive={false} />
            {approved && (
              <Panel position="top-right" className="m-3">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setServiceOpen(true)}
                  className="h-[30px] rounded-full px-3 text-[12px] shadow-[var(--shadow-md)]"
                >
                  <Plus size={13} /> New service
                </Button>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {selectedService && (
          <DeployServiceRail
            wid={wid}
            service={selectedService}
            tab={selectedTab}
            onClose={closeService}
            onTabChange={setTab}
          />
        )}
      </div>

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

const ServiceNode = memo(function ServiceNode(props: NodeProps) {
  const service = (props.data as ServiceNodeData).service;
  return <DeployServiceCard service={service} selected={props.selected} />;
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
            style={{
              filter:
                "drop-shadow(0 0 12px color-mix(in srgb, var(--color-accent) 60%, transparent))",
            }}
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
