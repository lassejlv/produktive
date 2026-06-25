import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Box, LayoutGrid, LayoutList, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "#/components/ui/input-group";
import { Sheet, SheetPopup } from "#/components/ui/sheet";
import { EmptyState } from "#/components/EmptyState";
import { Skeleton } from "#/components/ui/skeleton";
import { CreateSandboxDialog } from "#/components/sandboxes/CreateSandboxDialog";
import {
  SandboxApiTokensButton,
  SandboxApiTokensSheet,
} from "#/components/sandboxes/SandboxApiTokensSheet";
import { SandboxCard, SandboxRow } from "#/components/sandboxes/SandboxCard";
import { SandboxSheet } from "#/components/sandboxes/SandboxSheet";
import { cn } from "#/lib/cn";
import { DEPLOYMENTS_ENABLED, SANDBOXES_ENABLED } from "#/lib/features";
import {
  closeSandboxSearch,
  DEFAULT_SANDBOX_DETAIL_TAB,
  openSandboxSearch,
  parseSandboxesSearch,
  type SandboxDetailTab,
} from "#/lib/sandboxes";
import { toast } from "#/lib/toast";
import {
  deployAccessQuery,
  useCreateDeploySandbox,
  useDeployAccess,
  useDeployRegions,
  useDeploySandboxes,
} from "#/lib/queries";
import { RequestAccessOverlay } from "./_authed.$wid.deployments";

const sandboxesRoute = getRouteApi("/_authed/$wid/deployments/sandboxes");

export const Route = createFileRoute("/_authed/$wid/deployments/sandboxes")({
  staticData: {
    title: "Sandboxes",
    description: "Persistent Sprites.dev environments for agents and untrusted code.",
    parent: { label: "Deployments", to: "/$wid/deployments" },
  },
  validateSearch: parseSandboxesSearch,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(deployAccessQuery(params.wid)),
  component: DeploySandboxesPage,
});

function DeploySandboxesPage() {
  const { wid } = Route.useParams();

  if (!DEPLOYMENTS_ENABLED || !SANDBOXES_ENABLED) {
    return (
      <EmptyState
        icon={Box}
        title="Sandboxes not available"
        description="Sprites sandboxes are not enabled in this build."
      />
    );
  }

  return <DeploySandboxesContent wid={wid} />;
}

function DeploySandboxesContent({ wid }: { wid: string }) {
  const search = Route.useSearch();
  const navigate = sandboxesRoute.useNavigate();
  const access = useDeployAccess(wid);
  const approved = access.data?.status === "approved";
  const sandboxes = useDeploySandboxes(wid, approved);
  const regions = useDeployRegions(wid, approved);
  const create = useCreateDeploySandbox(wid);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [createOpen, setCreateOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = sandboxes.data ?? [];
    if (!needle) return rows;
    return rows.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.slug.toLowerCase().includes(needle) ||
        item.provider_name.toLowerCase().includes(needle),
    );
  }, [query, sandboxes.data]);

  const selected = search.sandbox
    ? ((sandboxes.data ?? []).find((item) => item.id === search.sandbox) ?? null)
    : null;
  const tab = search.tab ?? DEFAULT_SANDBOX_DETAIL_TAB;

  const openSandbox = (sandboxId: string, nextTab: SandboxDetailTab = DEFAULT_SANDBOX_DETAIL_TAB) => {
    void navigate({ search: openSandboxSearch(search, sandboxId, nextTab) });
  };

  const closeSandbox = () => {
    void navigate({ search: closeSandboxSearch(search) });
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "transition-opacity",
          !approved && "pointer-events-none select-none opacity-35 blur-[2px]",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-[18px] font-medium tracking-tight text-[var(--color-fg)]">
              Sandboxes
            </h1>
            <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
              Stateful Sprites.dev VMs with persistent filesystems.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="w-full min-w-[220px] sm:w-64">
              <InputGroupAddon>
                <Search size={14} />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sandboxes"
              />
            </InputGroup>
            <div className="flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
              <button
                type="button"
                onClick={() => setView("grid")}
                className={cn(
                  "rounded-[var(--radius-sm)] p-1.5",
                  view === "grid"
                    ? "bg-[var(--color-bg-row)] text-[var(--color-fg)]"
                    : "text-[var(--color-fg-muted)]",
                )}
                aria-label="Grid view"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={cn(
                  "rounded-[var(--radius-sm)] p-1.5",
                  view === "list"
                    ? "bg-[var(--color-bg-row)] text-[var(--color-fg)]"
                    : "text-[var(--color-fg-muted)]",
                )}
                aria-label="List view"
              >
                <LayoutList size={14} />
              </button>
            </div>
            <SandboxApiTokensButton onClick={() => setTokensOpen(true)} />
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)} disabled={!approved}>
              <Plus size={14} />
              Create sandbox
            </Button>
          </div>
        </div>

        {sandboxes.isLoading ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-[var(--radius-lg)]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Box}
            title={query ? "No sandboxes match your search" : "No sandboxes yet"}
            description={
              query
                ? "Try a different search term."
                : "Create a sandbox to run commands in an isolated Sprites.dev environment."
            }
            action={
              !query ? (
                <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus size={14} />
                  Create sandbox
                </Button>
              ) : undefined
            }
          />
        ) : view === "grid" ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-6">
            {filtered.map((sandbox) => (
              <SandboxCard
                key={sandbox.id}
                sandbox={sandbox}
                regions={regions.data}
                onClick={() => openSandbox(sandbox.id)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px] border-b border-[var(--color-border)] px-4 py-2 text-[11px] uppercase tracking-[0.06em] text-[var(--color-fg-dim)] sm:px-6">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_auto] gap-3">
                <span>Name</span>
                <span>Region</span>
                <span>Resources</span>
                <span>Status</span>
                <span>URL</span>
              </div>
            </div>
            {filtered.map((sandbox) => (
              <SandboxRow
                key={sandbox.id}
                sandbox={sandbox}
                regions={regions.data}
                onClick={() => openSandbox(sandbox.id)}
              />
            ))}
          </div>
        )}
      </div>

      {!approved && access.data && (
        <RequestAccessOverlay wid={wid} status={access.data.status} />
      )}

      <CreateSandboxDialog
        open={createOpen}
        pending={create.isPending}
        regions={regions.data ?? []}
        onOpenChange={setCreateOpen}
        onSubmit={(body) =>
          create.mutate(body, {
            onSuccess: (sandbox) => {
              toast.success("Sandbox created");
              setCreateOpen(false);
              openSandbox(sandbox.id);
            },
            onError: (error) => toast.error((error as Error).message),
          })
        }
      />

      <SandboxSheet
        open={!!selected}
        wid={wid}
        sandbox={selected ?? null}
        tab={tab}
        onClose={closeSandbox}
        onTabChange={(nextTab) => {
          if (!selected) return;
          void navigate({ search: openSandboxSearch(search, selected.id, nextTab) });
        }}
      />

      <Sheet open={tokensOpen} onOpenChange={setTokensOpen}>
        <SheetPopup
          side="right"
          className="flex h-full max-h-full min-h-0 w-full max-w-md flex-col border-0 border-s border-[var(--color-border)] bg-[var(--color-bg-elev)] p-0 shadow-none"
        >
          <SandboxApiTokensSheet wid={wid} open={tokensOpen} />
        </SheetPopup>
      </Sheet>
    </div>
  );
}
