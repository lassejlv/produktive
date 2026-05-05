import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  type ActivityEvent,
  createSupportTicket,
  getAdminOrganization,
  getAdminSession,
  getAdminUser,
  getGrowthAnalytics,
  getSupportTicket,
  listAdminOrganizations,
  listAdminUsers,
  listAuditEvents,
  listSupportTickets,
  replyToSupportTicket,
  retrySupportMessage,
  suspendAdminOrganization,
  suspendAdminUser,
  updateSupportTicket,
  unsuspendAdminOrganization,
  unsuspendAdminUser,
  type AdminOrganizationSummary,
  type AdminUserSummary,
  type AuditEvent,
  type GrowthPoint,
  type SupportTicketSummary,
} from "@/lib/admin-api";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminDashboard,
});

type Section = "overview" | "users" | "organizations" | "support" | "audit";
type SuspensionTarget =
  | { type: "user"; id: string; label: string; suspended: boolean }
  | { type: "organization"; id: string; label: string; suspended: boolean };

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Overview", subtitle: "Realtime platform health and growth" },
  users: { title: "Users", subtitle: "Find, audit, and manage end users" },
  organizations: { title: "Organizations", subtitle: "Workspaces and members" },
  support: { title: "Support", subtitle: "Customer tickets and email replies" },
  audit: { title: "Audit log", subtitle: "Operator actions and security events" },
};

function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("overview");
  const [range, setRange] = useState("30d");
  const [userSearch, setUserSearch] = useState("");
  const [userStatus, setUserStatus] = useState("all");
  const [orgSearch, setOrgSearch] = useState("");
  const [orgStatus, setOrgStatus] = useState("all");
  const [supportSearch, setSupportSearch] = useState("");
  const [supportStatus, setSupportStatus] = useState("open");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [suspensionTarget, setSuspensionTarget] = useState<SuspensionTarget | null>(null);
  const [composeSupportOpen, setComposeSupportOpen] = useState(false);
  const [auditFilter, setAuditFilter] = useState("all");

  const admin = useQuery({ queryKey: ["admin", "session"], queryFn: getAdminSession, retry: 0 });
  const growth = useQuery({
    queryKey: ["admin", "growth", range],
    queryFn: () => getGrowthAnalytics(range),
    enabled: admin.isSuccess,
  });
  const users = useQuery({
    queryKey: ["admin", "users", userSearch, userStatus],
    queryFn: () =>
      listAdminUsers({ search: userSearch, status: userStatus === "all" ? undefined : userStatus }),
    enabled: admin.isSuccess,
  });
  const organizations = useQuery({
    queryKey: ["admin", "organizations", orgSearch, orgStatus],
    queryFn: () =>
      listAdminOrganizations({
        search: orgSearch,
        status: orgStatus === "all" ? undefined : orgStatus,
      }),
    enabled: admin.isSuccess,
  });
  const audit = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => listAuditEvents(),
    enabled: admin.isSuccess,
  });
  const supportPollingEnabled = section === "support";
  const supportTickets = useQuery({
    queryKey: ["admin", "support", "tickets", supportSearch, supportStatus],
    queryFn: () =>
      listSupportTickets({
        search: supportSearch,
        status: supportStatus === "all" ? undefined : supportStatus,
      }),
    enabled: admin.isSuccess,
    refetchInterval: supportPollingEnabled ? 2000 : false,
    refetchIntervalInBackground: false,
  });
  const supportDetail = useQuery({
    queryKey: ["admin", "support", "ticket", selectedTicketId],
    queryFn: () => getSupportTicket(selectedTicketId!),
    enabled: Boolean(selectedTicketId) && admin.isSuccess,
    refetchInterval: supportPollingEnabled && selectedTicketId ? 1500 : false,
    refetchIntervalInBackground: false,
  });
  const userDetail = useQuery({
    queryKey: ["admin", "user", selectedUserId],
    queryFn: () => getAdminUser(selectedUserId!),
    enabled: Boolean(selectedUserId) && admin.isSuccess,
  });
  const organizationDetail = useQuery({
    queryKey: ["admin", "organization", selectedOrgId],
    queryFn: () => getAdminOrganization(selectedOrgId!),
    enabled: Boolean(selectedOrgId) && admin.isSuccess,
  });

  const invalidateAdmin = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "growth"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "audit"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "user"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "organization"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "support"] }),
    ]);

  const supportReplyMutation = useMutation({
    mutationFn: (input: { id: string; bodyText: string; closeAfterReply?: boolean }) =>
      replyToSupportTicket(input.id, {
        bodyText: input.bodyText,
        closeAfterReply: input.closeAfterReply,
      }),
    onSuccess: async (result) => {
      setSelectedTicketId(result.ticket.ticket.id);
      await queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
      toast.success(
        result.message.deliveryStatus === "sent" ? "Reply sent" : "Reply saved as failed",
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Reply failed");
    },
  });

  const supportCreateMutation = useMutation({
    mutationFn: createSupportTicket,
    onSuccess: async (result) => {
      setSelectedTicketId(result.ticket.ticket.id);
      setSupportStatus("all");
      setSection("support");
      setComposeSupportOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
      toast.success(
        result.message.deliveryStatus === "sent" ? "Email sent" : "Email saved as failed",
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Email failed");
    },
  });

  const supportUpdateMutation = useMutation({
    mutationFn: (input: {
      id: string;
      status?: string;
      priority?: string;
      assignedAdminId?: string | null;
    }) => updateSupportTicket(input.id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
      toast.success("Ticket updated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Ticket update failed");
    },
  });

  const supportRetryMutation = useMutation({
    mutationFn: retrySupportMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
      toast.success("Retry complete");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Retry failed");
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async (input: { target: SuspensionTarget; reason: string; note?: string }) => {
      if (input.target.type === "user") {
        if (input.target.suspended) return unsuspendAdminUser(input.target.id);
        return suspendAdminUser(input.target.id, { reason: input.reason, note: input.note });
      }
      if (input.target.suspended) return unsuspendAdminOrganization(input.target.id);
      return suspendAdminOrganization(input.target.id, { reason: input.reason, note: input.note });
    },
    onSuccess: async (_, variables) => {
      await invalidateAdmin();
      setSuspensionTarget(null);
      toast.success(variables.target.suspended ? "Access restored" : "Access suspended");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Action failed");
    },
  });

  if (admin.isLoading) {
    return <AdminShellState title="Admin" message="Checking operator access..." />;
  }

  if (admin.isError) {
    return (
      <AdminShellState
        title="Admin access required"
        message={admin.error instanceof Error ? admin.error.message : "You cannot open this area."}
      >
        <button
          type="button"
          onClick={() => void navigate({ to: "/workspace" })}
          className="h-9 rounded-[6px] border border-border px-3 text-[13px] text-fg hover:bg-surface"
        >
          Back to app
        </button>
      </AdminShellState>
    );
  }

  const adminData = admin.data;
  if (!adminData) {
    return <AdminShellState title="Admin" message="Operator session was not returned." />;
  }

  const totals = growth.data?.totals;
  const points = growth.data?.points ?? [];
  const auditEvents = audit.data?.events ?? [];
  const filteredAudit = auditEvents.filter((event) => {
    if (auditFilter === "all") return true;
    return event.action.toLowerCase().startsWith(auditFilter);
  });

  return (
    <main className="h-screen overflow-hidden bg-bg text-fg">
      <div className="grid h-screen grid-cols-[244px_minmax(0,1fr)] grid-rows-[56px_minmax(0,1fr)]">
        <aside className="col-start-1 row-span-2 flex min-w-0 flex-col border-r border-border-subtle bg-sidebar">
          <div className="flex h-14 items-center gap-[10px] border-b border-border-subtle px-4">
            <div className="grid h-7 w-7 place-items-center rounded-[7px] bg-accent text-[#1a1410]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12 12 3l9 9-9 9-9-9Z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold tracking-tight text-fg">
                Produktive
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                Ops · Admin
              </p>
            </div>
          </div>

          <div className="mx-3 mt-3 flex h-[38px] items-center gap-2 rounded-[6px] border border-border-subtle bg-surface px-[10px]">
            <div className="grid h-[22px] w-[22px] place-items-center rounded-[4px] bg-surface-2 font-mono text-[11px] font-semibold">
              P
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-fg">Platform admin</p>
              <p className="font-mono text-[10px] text-fg-faint">{adminData.role}</p>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-[18px] overflow-auto p-3">
            <NavGroup label="Operations">
              {(
                [
                  { id: "overview", label: "Overview", icon: "grid" },
                  { id: "users", label: "Users", icon: "users", count: totals?.users },
                  {
                    id: "organizations",
                    label: "Organizations",
                    icon: "building",
                    count: totals?.organizations,
                  },
                  {
                    id: "support",
                    label: "Support",
                    icon: "inbox",
                    count: supportTickets.data?.page.total,
                  },
                  { id: "audit", label: "Audit log", icon: "shield" },
                ] satisfies { id: Section; label: string; icon: IconName; count?: number }[]
              ).map((item) => (
                <NavItem
                  key={item.id}
                  active={section === item.id}
                  icon={item.icon}
                  label={item.label}
                  count={item.count}
                  onClick={() => setSection(item.id)}
                />
              ))}
            </NavGroup>

            <NavGroup label="Live">
              <div className="rounded-[6px] border border-border-subtle bg-bg px-[10px] py-2">
                <div className="mb-[6px] flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.08em] text-fg-faint">
                    Active sessions
                  </span>
                  <span className="block h-[6px] w-[6px] animate-pulse rounded-full bg-success" />
                </div>
                <p className="font-mono text-[22px] font-semibold leading-none tracking-tight text-fg">
                  {totals ? totals.users - (totals.suspendedUsers ?? 0) : "—"}
                </p>
                <p className="mt-[2px] text-[10.5px] text-fg-muted">
                  across {totals?.organizations ?? "—"} workspaces
                </p>
              </div>
            </NavGroup>
          </nav>

          <div className="flex items-center gap-[10px] border-t border-border-subtle p-3">
            <Avatar name={adminData.user.name || adminData.user.email} seed={adminData.user.id} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-fg">
                {adminData.user.name || adminData.user.email}
              </p>
              <p className="truncate font-mono text-[10.5px] text-fg-faint">{adminData.role}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="grid h-7 w-7 place-items-center rounded-[5px] border border-border-subtle text-fg-muted hover:bg-surface"
              title="Sign out"
            >
              <Icon name="logout" size={13} />
            </button>
          </div>
        </aside>

        <header className="col-start-2 row-start-1 flex h-14 items-center gap-4 border-b border-border-subtle bg-bg px-6">
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <h1 className="m-0 text-[16px] font-semibold tracking-tight text-fg">
              {SECTION_META[section].title}
            </h1>
            <span className="truncate text-[12px] text-fg-faint">
              {SECTION_META[section].subtitle}
            </span>
          </div>
          {section === "overview" ? (
            <div className="flex gap-1 rounded-[6px] border border-border-subtle bg-surface p-[2px]">
              {["7d", "30d", "90d"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={cn(
                    "h-6 rounded-[4px] px-[10px] font-mono text-[11px]",
                    range === item ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void navigate({ to: "/workspace" })}
            className="grid h-8 place-items-center rounded-[6px] border border-border-subtle bg-surface px-3 text-[12px] text-fg-muted hover:text-fg"
          >
            Back to app
          </button>
        </header>

        <section className="col-start-2 row-start-2 min-w-0 overflow-auto p-5">
          {section === "overview" ? (
            <Overview
              totals={totals}
              points={points}
              range={range}
              auditEvents={auditEvents}
              isLoading={growth.isLoading}
            />
          ) : null}
          {section === "users" ? (
            <UsersView
              users={users.data?.users ?? []}
              pageTotal={users.data?.page.total ?? 0}
              search={userSearch}
              status={userStatus}
              isLoading={users.isLoading}
              selected={selectedUserId}
              detail={userDetail.data}
              onSearch={setUserSearch}
              onStatus={setUserStatus}
              onSelect={setSelectedUserId}
              onSuspend={setSuspensionTarget}
            />
          ) : null}
          {section === "organizations" ? (
            <OrganizationsView
              organizations={organizations.data?.organizations ?? []}
              pageTotal={organizations.data?.page.total ?? 0}
              search={orgSearch}
              status={orgStatus}
              isLoading={organizations.isLoading}
              selected={selectedOrgId}
              detail={organizationDetail.data}
              onSearch={setOrgSearch}
              onStatus={setOrgStatus}
              onSelect={setSelectedOrgId}
              onSuspend={setSuspensionTarget}
            />
          ) : null}
          {section === "audit" ? (
            <AuditView
              events={filteredAudit}
              total={auditEvents.length}
              isLoading={audit.isLoading}
              filter={auditFilter}
              onFilter={setAuditFilter}
            />
          ) : null}
          {section === "support" ? (
            <SupportView
              tickets={supportTickets.data?.tickets ?? []}
              pageTotal={supportTickets.data?.page.total ?? 0}
              search={supportSearch}
              status={supportStatus}
              isLoading={supportTickets.isLoading}
              selected={selectedTicketId}
              detail={supportDetail.data}
              replyBusy={supportReplyMutation.isPending}
              createBusy={supportCreateMutation.isPending}
              updateBusy={supportUpdateMutation.isPending}
              retryBusy={supportRetryMutation.isPending}
              onSearch={setSupportSearch}
              onStatus={setSupportStatus}
              onSelect={setSelectedTicketId}
              onCompose={() => setComposeSupportOpen(true)}
              onReply={(bodyText, closeAfterReply) => {
                if (!selectedTicketId) return;
                supportReplyMutation.mutate({ id: selectedTicketId, bodyText, closeAfterReply });
              }}
              onUpdate={(input) => {
                if (!selectedTicketId) return;
                supportUpdateMutation.mutate({ id: selectedTicketId, ...input });
              }}
              onRetry={(messageId) => supportRetryMutation.mutate(messageId)}
            />
          ) : null}
        </section>
      </div>

      {suspensionTarget ? (
        <SuspensionDialog
          target={suspensionTarget}
          busy={suspendMutation.isPending}
          onClose={() => setSuspensionTarget(null)}
          onSubmit={(reason, note) =>
            suspendMutation.mutate({ target: suspensionTarget, reason, note })
          }
        />
      ) : null}
      {composeSupportOpen ? (
        <ComposeSupportDialog
          busy={supportCreateMutation.isPending}
          onClose={() => setComposeSupportOpen(false)}
          onSubmit={(input) => supportCreateMutation.mutate(input)}
        />
      ) : null}
    </main>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-2 pb-[6px] text-[10px] font-medium uppercase tracking-[0.1em] text-fg-faint">
        {label}
      </div>
      <div className="flex flex-col gap-[1px]">{children}</div>
    </div>
  );
}

function NavItem({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: IconName;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-8 items-center gap-[9px] rounded-[6px] px-2 text-left text-[13px]",
        active
          ? "bg-surface-2 font-medium text-fg"
          : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      {active ? (
        <span className="absolute -left-3 bottom-[6px] top-[6px] w-[2px] rounded-r-[2px] bg-accent" />
      ) : null}
      <Icon name={icon} size={15} />
      <span className="flex-1">{label}</span>
      {count != null ? (
        <span
          className={cn(
            "rounded-[3px] px-[6px] py-px font-mono text-[10px]",
            active
              ? "border border-border-subtle bg-bg text-fg-muted"
              : "text-fg-faint",
          )}
        >
          {fmtCount(count)}
        </span>
      ) : null}
    </button>
  );
}

function Overview({
  totals,
  points,
  range,
  auditEvents,
  isLoading,
}: {
  totals:
    | {
        users: number;
        organizations: number;
        suspendedUsers: number;
        suspendedOrganizations: number;
      }
    | undefined;
  points: GrowthPoint[];
  range: string;
  auditEvents: AuditEvent[];
  isLoading: boolean;
}) {
  const [metric, setMetric] = useState<"users" | "organizations">("users");
  const trail = points.slice(-12);
  const sparkUsers = trail.map((p) => p.users);
  const sparkOrgs = trail.map((p) => p.organizations);

  const userDelta = useMemo(() => deltaPercent(sparkUsers), [sparkUsers]);
  const orgDelta = useMemo(() => deltaPercent(sparkOrgs), [sparkOrgs]);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Total users" value={totals?.users} delta={userDelta} spark={sparkUsers} />
        <Kpi
          label="Organizations"
          value={totals?.organizations}
          delta={orgDelta}
          spark={sparkOrgs}
        />
        <Kpi
          label="Suspended users"
          value={totals?.suspendedUsers}
          tone="danger"
          spark={sparkUsers.map(() => 0)}
        />
        <Kpi
          label="Suspended orgs"
          value={totals?.suspendedOrganizations}
          tone="danger"
          spark={sparkOrgs.map(() => 0)}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] gap-3">
        <Panel
          title="Growth"
          meta={`Last ${range}`}
          action={
            <div className="flex gap-1 rounded-[6px] border border-border-subtle bg-bg p-[2px]">
              {(
                [
                  ["users", "Users"],
                  ["organizations", "Orgs"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMetric(key)}
                  className={cn(
                    "h-[22px] rounded-[4px] px-2 text-[11px]",
                    metric === key ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          <GrowthChart points={points} metric={metric} loading={isLoading} />
        </Panel>

        <Panel title="Recent activity" meta={`${auditEvents.length} events`}>
          <div className="flex flex-col">
            {auditEvents.slice(0, 6).map((event, index) => (
              <div
                key={event.id}
                className={cn(
                  "flex items-start gap-[10px] py-2 text-[12px]",
                  index < Math.min(auditEvents.length, 6) - 1 && "border-b border-border-subtle",
                )}
              >
                <span
                  className={cn(
                    "mt-[6px] h-[6px] w-[6px] flex-shrink-0 rounded-full",
                    actionDot(event.action),
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] text-fg">{event.action}</p>
                  <p className="truncate text-[11.5px] text-fg-muted">
                    <span className="text-fg-faint">{event.actor.email} →</span>{" "}
                    {event.targetType}:{event.targetId}
                  </p>
                </div>
                <span className="flex-shrink-0 font-mono text-[10px] text-fg-faint">
                  {relativeShort(event.createdAt)}
                </span>
              </div>
            ))}
            {auditEvents.length === 0 ? (
              <p className="py-3 text-[12px] text-fg-faint">No audit events yet.</p>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function UsersView({
  users,
  pageTotal,
  search,
  status,
  isLoading,
  selected,
  detail,
  onSearch,
  onStatus,
  onSelect,
  onSuspend,
}: {
  users: AdminUserSummary[];
  pageTotal: number;
  search: string;
  status: string;
  isLoading: boolean;
  selected: string | null;
  detail: Awaited<ReturnType<typeof getAdminUser>> | undefined;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onSelect: (value: string) => void;
  onSuspend: (target: SuspensionTarget) => void;
}) {
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_360px] gap-3">
      <Panel title="Users" meta={`${users.length} of ${pageTotal}`} noPad>
        <div className="flex items-center gap-2 border-b border-border-subtle px-[14px] py-3">
          <SearchInput
            value={search}
            onChange={onSearch}
            placeholder="Search by name, email, org..."
            width={300}
            kbd="⌘K"
          />
          <div className="flex gap-1">
            {(["all", "active", "suspended"] as const).map((item) => (
              <Pill key={item} active={status === item} onClick={() => onStatus(item)}>
                {item}
              </Pill>
            ))}
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-border-subtle">
                {["User", "Status", "Workspaces", "Last seen", "Joined"].map((label, idx) => (
                  <th
                    key={label}
                    className={cn(
                      "px-[14px] py-[9px] text-left text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint",
                      idx === 1 && "w-28",
                      idx === 2 && "w-28",
                      idx === 3 && "w-28",
                      idx === 4 && "w-28",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => onSelect(user.id)}
                  className={cn(
                    "cursor-pointer border-b border-border-subtle",
                    selected === user.id ? "bg-surface-2" : "hover:bg-surface",
                  )}
                >
                  <td className="min-w-0 px-[14px] py-[10px]">
                    <div className="flex min-w-0 items-center gap-[10px]">
                      <Avatar name={user.name} seed={user.id} size={28} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-fg">
                          {user.name || "—"}
                        </p>
                        <p className="truncate font-mono text-[11.5px] text-fg-faint">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-[14px] py-[10px]">
                    <StatusDot kind={user.suspendedAt ? "suspended" : "active"} />
                  </td>
                  <td className="px-[14px] py-[10px] font-mono text-[12px] text-fg-muted">
                    {user.organizationCount}
                  </td>
                  <td className="px-[14px] py-[10px] text-[12px] text-fg-muted">
                    {shortDate(user.lastSessionAt)}
                  </td>
                  <td className="px-[14px] py-[10px] text-[12px] text-fg-faint">
                    {shortDate(user.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {isLoading ? (
            <p className="px-4 py-3 text-[12px] text-fg-faint">Loading users...</p>
          ) : null}
          {!isLoading && users.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-fg-faint">No users match these filters.</p>
          ) : null}
        </div>
      </Panel>

      <UserDetailPanel detail={detail} onSuspend={onSuspend} />
    </div>
  );
}

function UserDetailPanel({
  detail,
  onSuspend,
}: {
  detail: Awaited<ReturnType<typeof getAdminUser>> | undefined;
  onSuspend: (target: SuspensionTarget) => void;
}) {
  if (!detail) {
    return (
      <Panel title="User detail">
        <p className="py-6 text-[12px] text-fg-faint">Select a user</p>
      </Panel>
    );
  }
  const user = detail.user;
  return (
    <Panel title="User detail" meta={user.id}>
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-3">
          <Avatar name={user.name || user.email} seed={user.id} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-fg">{user.name || "—"}</p>
            <p className="truncate font-mono text-[12px] text-fg-faint">{user.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusDot kind={user.suspendedAt ? "suspended" : "active"} />
          <Tag>{user.emailVerified ? "verified" : "unverified"}</Tag>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Active sessions" value={detail.sessions.active} />
          <Stat label="Workspaces" value={detail.memberships.length} />
          <Stat label="Joined" value={shortDate(user.createdAt)} mono={false} />
          <Stat label="Last seen" value={shortDate(user.lastSessionAt)} mono={false} />
        </div>

        {user.suspendedAt ? (
          <div className="rounded-[6px] border border-danger/35 bg-danger/10 p-[10px] text-[12px] text-danger">
            <p className="mb-[3px] font-mono text-[10px] uppercase tracking-[0.08em]">
              Suspension reason
            </p>
            {user.suspensionReason || "No reason recorded"}
          </div>
        ) : null}

        <div className="flex gap-[6px]">
          <Btn
            kind={user.suspendedAt ? "primary" : "danger"}
            onClick={() =>
              onSuspend({
                type: "user",
                id: user.id,
                label: user.email,
                suspended: Boolean(user.suspendedAt),
              })
            }
          >
            {user.suspendedAt ? "Unsuspend" : "Suspend"}
          </Btn>
        </div>

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            Memberships
          </p>
          <div className="flex flex-col gap-1">
            {detail.memberships.slice(0, 6).map((membership) => (
              <div
                key={membership.organizationId}
                className="flex items-center justify-between border-b border-border-subtle py-[6px] text-[11.5px]"
              >
                <span className="truncate text-fg">{membership.organizationName}</span>
                <span className="font-mono text-[10px] text-fg-faint">{membership.role}</span>
              </div>
            ))}
            {detail.memberships.length === 0 ? (
              <p className="text-[11.5px] text-fg-faint">No memberships</p>
            ) : null}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            Recent events
          </p>
          <div className="flex flex-col">
            {detail.activityEvents.slice(0, 6).map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
            {detail.activityEvents.length === 0 ? (
              <p className="text-[11.5px] text-fg-faint">No activity</p>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function OrganizationsView({
  organizations,
  pageTotal,
  search,
  status,
  isLoading,
  selected,
  detail,
  onSearch,
  onStatus,
  onSelect,
  onSuspend,
}: {
  organizations: AdminOrganizationSummary[];
  pageTotal: number;
  search: string;
  status: string;
  isLoading: boolean;
  selected: string | null;
  detail: Awaited<ReturnType<typeof getAdminOrganization>> | undefined;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onSelect: (value: string) => void;
  onSuspend: (target: SuspensionTarget) => void;
}) {
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_360px] gap-3">
      <Panel title="Organizations" meta={`${organizations.length} of ${pageTotal}`} noPad>
        <div className="flex items-center gap-2 border-b border-border-subtle px-[14px] py-3">
          <SearchInput
            value={search}
            onChange={onSearch}
            placeholder="Search by name, slug, owner..."
            width={300}
          />
          <div className="flex gap-1">
            {(["all", "active", "suspended"] as const).map((item) => (
              <Pill key={item} active={status === item} onClick={() => onStatus(item)}>
                {item}
              </Pill>
            ))}
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-border-subtle">
                {[
                  ["Organization", "auto"],
                  ["Status", "110px"],
                  ["Members", "90px"],
                  ["Issues", "90px"],
                  ["Owners", "90px"],
                  ["Created", "110px"],
                ].map(([label, width]) => (
                  <th
                    key={label}
                    style={{ width: width === "auto" ? undefined : width }}
                    className="px-[14px] py-[9px] text-left text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr
                  key={org.id}
                  onClick={() => onSelect(org.id)}
                  className={cn(
                    "cursor-pointer border-b border-border-subtle",
                    selected === org.id ? "bg-surface-2" : "hover:bg-surface",
                  )}
                >
                  <td className="min-w-0 px-[14px] py-[10px]">
                    <div className="flex min-w-0 items-center gap-[10px]">
                      <OrgGlyph name={org.name} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-fg">{org.name}</p>
                        <p className="truncate font-mono text-[11px] text-fg-faint">/{org.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-[14px] py-[10px]">
                    <StatusDot kind={org.suspendedAt ? "suspended" : "active"} />
                  </td>
                  <td className="px-[14px] py-[10px] font-mono text-[12px] text-fg-muted">
                    {org.memberCount}
                  </td>
                  <td className="px-[14px] py-[10px] font-mono text-[12px] text-fg-muted">
                    {fmtCount(org.issueCount)}
                  </td>
                  <td className="px-[14px] py-[10px] font-mono text-[12px] text-fg-muted">
                    {org.ownerCount}
                  </td>
                  <td className="px-[14px] py-[10px] text-[12px] text-fg-faint">
                    {shortDate(org.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {isLoading ? (
            <p className="px-4 py-3 text-[12px] text-fg-faint">Loading organizations...</p>
          ) : null}
          {!isLoading && organizations.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-fg-faint">
              No organizations match these filters.
            </p>
          ) : null}
        </div>
      </Panel>

      <OrgDetailPanel detail={detail} onSuspend={onSuspend} />
    </div>
  );
}

function OrgDetailPanel({
  detail,
  onSuspend,
}: {
  detail: Awaited<ReturnType<typeof getAdminOrganization>> | undefined;
  onSuspend: (target: SuspensionTarget) => void;
}) {
  if (!detail) {
    return (
      <Panel title="Organization detail">
        <p className="py-6 text-[12px] text-fg-faint">Select an organization</p>
      </Panel>
    );
  }
  const org = detail.organization;
  return (
    <Panel title="Organization detail" meta={org.id}>
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-3">
          <OrgGlyph name={org.name} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-fg">{org.name}</p>
            <p className="truncate font-mono text-[12px] text-fg-faint">/{org.slug}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <StatusDot kind={org.suspendedAt ? "suspended" : "active"} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Members" value={org.memberCount} />
          <Stat label="Projects" value={org.projectCount} />
          <Stat label="Issues" value={fmtCount(org.issueCount)} mono />
          <Stat label="Owners" value={org.ownerCount} />
          <Stat label="Active sessions" value={detail.sessions.active} />
          <Stat label="Created" value={shortDate(org.createdAt)} mono={false} />
        </div>

        {detail.owners[0] ? (
          <div className="rounded-[6px] border border-border-subtle bg-bg p-[10px]">
            <p className="mb-[4px] text-[10px] uppercase tracking-[0.08em] text-fg-faint">Owner</p>
            <div className="flex items-center gap-2">
              <Avatar name={detail.owners[0].name} seed={detail.owners[0].id} size={22} />
              <div className="min-w-0">
                <p className="truncate text-[12.5px] text-fg">{detail.owners[0].name}</p>
                <p className="truncate font-mono text-[11px] text-fg-faint">
                  {detail.owners[0].email}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {org.suspendedAt ? (
          <div className="rounded-[6px] border border-danger/35 bg-danger/10 p-[10px] text-[12px] text-danger">
            <p className="mb-[3px] font-mono text-[10px] uppercase tracking-[0.08em]">
              Suspension reason
            </p>
            {org.suspensionReason || "No reason recorded"}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-[6px]">
          <Btn
            kind={org.suspendedAt ? "primary" : "danger"}
            onClick={() =>
              onSuspend({
                type: "organization",
                id: org.id,
                label: org.name,
                suspended: Boolean(org.suspendedAt),
              })
            }
          >
            {org.suspendedAt ? "Unsuspend" : "Suspend"}
          </Btn>
        </div>

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-fg-faint">Members</p>
          <div className="flex max-h-56 flex-col gap-1 overflow-auto">
            {detail.members.slice(0, 12).map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-[8px] border-b border-border-subtle py-[6px]"
              >
                <Avatar name={member.name || member.email} seed={member.id} size={22} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-fg">{member.name}</p>
                  <p className="truncate font-mono text-[10.5px] text-fg-faint">{member.email}</p>
                </div>
                <span className="font-mono text-[10px] text-fg-faint">{member.role}</span>
              </div>
            ))}
            {detail.members.length === 0 ? (
              <p className="text-[11.5px] text-fg-faint">No members</p>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function AuditView({
  events,
  total,
  isLoading,
  filter,
  onFilter,
}: {
  events: AuditEvent[];
  total: number;
  isLoading: boolean;
  filter: string;
  onFilter: (value: string) => void;
}) {
  return (
    <Panel
      title="Audit log"
      meta={`${events.length} of ${total} events`}
      noPad
      action={
        <div className="flex gap-1">
          {["all", "user", "org", "support", "admin"].map((item) => (
            <Pill key={item} active={filter === item} onClick={() => onFilter(item)}>
              {item}
            </Pill>
          ))}
        </div>
      }
    >
      <div className="overflow-auto">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-b border-border-subtle">
              {[
                ["Action", "200px"],
                ["Actor", "220px"],
                ["Target", "auto"],
                ["Reason", "220px"],
                ["Time", "150px"],
              ].map(([label, width]) => (
                <th
                  key={label}
                  style={{ width: width === "auto" ? undefined : width }}
                  className="px-[14px] py-[9px] text-left text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b border-border-subtle">
                <td className="px-[14px] py-[11px]">
                  <span className="inline-flex items-center gap-2 font-mono text-[12px] text-fg">
                    <span
                      className={cn("h-[6px] w-[6px] rounded-full", actionDot(event.action))}
                    />
                    {event.action}
                  </span>
                </td>
                <td className="px-[14px] py-[11px]">
                  <div className="flex items-center gap-2">
                    <Avatar name={event.actor.name || event.actor.email} seed={event.actor.id} size={22} />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] text-fg">{event.actor.name}</p>
                      <p className="truncate font-mono text-[10.5px] text-fg-faint">
                        {event.actor.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="truncate px-[14px] py-[11px] font-mono text-[12px] text-fg-muted">
                  <span className="text-fg-faint">{event.targetType}:</span> {event.targetId}
                </td>
                <td className="px-[14px] py-[11px] text-[12px] text-fg-muted">
                  {event.reason ?? "—"}
                </td>
                <td className="px-[14px] py-[11px] font-mono text-[11px] text-fg-faint">
                  {longDate(event.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading ? (
          <p className="px-4 py-3 text-[12px] text-fg-faint">Loading audit events...</p>
        ) : null}
        {!isLoading && events.length === 0 ? (
          <p className="px-4 py-6 text-[12px] text-fg-faint">No audit events match this filter.</p>
        ) : null}
      </div>
    </Panel>
  );
}

function SupportView({
  tickets,
  pageTotal,
  search,
  status,
  isLoading,
  selected,
  detail,
  replyBusy,
  createBusy,
  updateBusy,
  retryBusy,
  onSearch,
  onStatus,
  onSelect,
  onCompose,
  onReply,
  onUpdate,
  onRetry,
}: {
  tickets: SupportTicketSummary[];
  pageTotal: number;
  search: string;
  status: string;
  isLoading: boolean;
  selected: string | null;
  detail: Awaited<ReturnType<typeof getSupportTicket>> | undefined;
  replyBusy: boolean;
  createBusy: boolean;
  updateBusy: boolean;
  retryBusy: boolean;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onSelect: (value: string) => void;
  onCompose: () => void;
  onReply: (bodyText: string, closeAfterReply: boolean) => void;
  onUpdate: (input: {
    status?: string;
    priority?: string;
    assignedAdminId?: string | null;
  }) => void;
  onRetry: (messageId: string) => void;
}) {
  const [reply, setReply] = useState("");
  const [closeAfterReply, setCloseAfterReply] = useState(false);
  const ticket = detail?.ticket;

  const submitReply = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim() || replyBusy) return;
    onReply(reply, closeAfterReply);
    setReply("");
    setCloseAfterReply(false);
  };

  return (
    <div className="grid h-full grid-cols-[320px_minmax(0,1fr)_300px] gap-3">
      <Panel
        title="Inbox"
        meta={`${tickets.length} of ${pageTotal}`}
        noPad
        action={
          <Btn kind="primary" size="sm" onClick={onCompose} disabled={createBusy}>
            + New
          </Btn>
        }
      >
        <div className="border-b border-border-subtle p-[10px]">
          <SearchInput value={search} onChange={onSearch} placeholder="Search tickets" />
          <div className="mt-2 flex gap-1">
            {(["open", "pending", "closed", "all"] as const).map((item) => (
              <Pill key={item} active={status === item} onClick={() => onStatus(item)}>
                {item}
              </Pill>
            ))}
          </div>
        </div>
        <div className="overflow-auto">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onSelect(ticket.id)}
              className={cn(
                "block w-full border-b border-l-2 border-border-subtle px-[14px] py-3 text-left",
                selected === ticket.id
                  ? "border-l-accent bg-surface-2"
                  : "border-l-transparent hover:bg-surface",
              )}
            >
              <div className="mb-1 flex items-center gap-[6px]">
                <span className="font-mono text-[10px] text-fg-faint">{ticket.number}</span>
                <PriorityChip priority={ticket.priority} />
                <span className="ml-auto font-mono text-[10px] text-fg-faint">
                  {relativeShort(ticket.lastMessageAt)}
                </span>
              </div>
              <p className="mb-[2px] truncate text-[13px] font-medium text-fg">{ticket.subject}</p>
              <p className="truncate text-[11.5px] text-fg-muted">
                <span className="text-fg-faint">
                  {ticket.customerName ?? ticket.customerEmail}
                </span>
              </p>
            </button>
          ))}
          {isLoading ? (
            <p className="p-4 text-[12px] text-fg-faint">Loading tickets...</p>
          ) : null}
          {!isLoading && tickets.length === 0 ? (
            <p className="p-4 text-[12px] text-fg-faint">No tickets match these filters.</p>
          ) : null}
        </div>
      </Panel>

      <Panel
        title={ticket?.subject || "Conversation"}
        meta={ticket?.number}
        action={
          ticket ? (
            <div className="flex gap-[6px]">
              <Btn
                size="sm"
                onClick={() =>
                  onUpdate({ status: ticket.status === "closed" ? "open" : "closed" })
                }
                disabled={updateBusy}
              >
                {ticket.status === "closed" ? "Reopen" : "Close"}
              </Btn>
            </div>
          ) : null
        }
      >
        {ticket && detail ? (
          <div className="flex h-[calc(100vh-176px)] flex-col gap-3">
            <div className="flex items-center gap-3 border-b border-border-subtle pb-3">
              <Avatar
                name={ticket.customerName || ticket.customerEmail}
                seed={ticket.customerEmail}
                size={36}
              />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-fg">
                  {ticket.customerName ?? "Unknown"}
                </p>
                <p className="truncate font-mono text-[12px] text-fg-faint">
                  {ticket.customerEmail}
                </p>
              </div>
              <div className="ml-auto flex gap-[6px]">
                <PriorityChip priority={ticket.priority} />
                <StatusDot kind={ticket.status} />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
              {detail.messages.map((message) => {
                const outbound = message.direction === "outbound";
                return (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-[6px] border border-border-subtle p-[14px]",
                      outbound ? "ml-8 bg-accent/[0.04]" : "bg-bg",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span
                        className={cn(
                          "text-[12px] font-medium",
                          outbound ? "text-accent" : "text-fg",
                        )}
                      >
                        {outbound ? "Produktive Support" : ticket.customerName ?? message.fromEmail}
                      </span>
                      <span className="font-mono text-[10px] text-fg-faint">
                        {longDate(message.createdAt)}
                      </span>
                    </div>
                    <p className="m-0 whitespace-pre-wrap text-[13px] leading-6 text-fg-muted">
                      {message.bodyText ?? stripHtml(message.bodyHtml ?? "")}
                    </p>
                    {message.deliveryStatus === "failed" ? (
                      <div className="mt-3 rounded-[5px] border border-danger/35 bg-danger/10 p-2 text-[11px] text-danger">
                        <p>{message.deliveryError ?? "Email send failed"}</p>
                        <button
                          type="button"
                          disabled={retryBusy}
                          onClick={() => onRetry(message.id)}
                          className="mt-2 h-7 rounded-[5px] border border-danger/45 px-2 disabled:opacity-50"
                        >
                          Retry send
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 font-mono text-[10px] text-fg-faint">
                        {message.deliveryStatus}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={submitReply}
              className="rounded-[6px] border border-border bg-bg p-[10px]"
            >
              <textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Reply to customer..."
                className="block w-full resize-y border-none bg-transparent p-[6px] text-[13px] leading-6 text-fg outline-none placeholder:text-fg-faint"
                style={{ minHeight: 80 }}
              />
              <div className="mt-[6px] flex items-center justify-between">
                <label className="flex items-center gap-[6px] text-[11.5px] text-fg-muted">
                  <input
                    type="checkbox"
                    checked={closeAfterReply}
                    onChange={(event) => setCloseAfterReply(event.target.checked)}
                  />
                  Close after reply
                </label>
                <Btn kind="primary" size="sm" disabled={!reply.trim() || replyBusy}>
                  {replyBusy ? "Sending..." : "Send reply"}
                </Btn>
              </div>
            </form>
          </div>
        ) : (
          <p className="py-6 text-[12px] text-fg-faint">Select a ticket</p>
        )}
      </Panel>

      <Panel title="Context">
        {ticket && detail ? (
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-[6px] text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                Customer
              </p>
              <div className="flex items-center gap-[10px]">
                <Avatar
                  name={ticket.customerName || ticket.customerEmail}
                  seed={ticket.customerEmail}
                  size={32}
                />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-fg">
                    {ticket.customerName ?? "Unknown"}
                  </p>
                  <p className="truncate font-mono text-[11px] text-fg-faint">
                    {ticket.customerEmail}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-[6px]">
              <Stat label="Status" value={ticket.status} mono={false} />
              <Stat label="Priority" value={ticket.priority} mono={false} />
              <Stat label="Messages" value={ticket.messageCount} />
              <Stat label="Created" value={shortDate(ticket.createdAt)} mono={false} />
            </div>

            <div>
              <p className="mb-[6px] text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                Update
              </p>
              <div className="flex flex-col gap-2">
                <select
                  value={ticket.status}
                  disabled={updateBusy}
                  onChange={(event) => onUpdate({ status: event.target.value })}
                  className="h-9 w-full rounded-[5px] border border-border-subtle bg-bg px-2 text-[12px] text-fg"
                >
                  <option value="open">Status · Open</option>
                  <option value="pending">Status · Pending</option>
                  <option value="closed">Status · Closed</option>
                </select>
                <select
                  value={ticket.priority}
                  disabled={updateBusy}
                  onChange={(event) => onUpdate({ priority: event.target.value })}
                  className="h-9 w-full rounded-[5px] border border-border-subtle bg-bg px-2 text-[12px] text-fg"
                >
                  <option value="normal">Priority · Normal</option>
                  <option value="high">Priority · High</option>
                  <option value="urgent">Priority · Urgent</option>
                </select>
              </div>
            </div>

            {detail.customerUser ? (
              <div>
                <p className="mb-[6px] text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                  Account
                </p>
                <div className="rounded-[6px] border border-border-subtle bg-bg p-[10px] text-[12px]">
                  <p className="text-fg">{detail.customerUser.name}</p>
                  <p className="font-mono text-[11px] text-fg-faint">
                    {detail.customerUser.emailVerified ? "verified" : "unverified"} ·{" "}
                    {detail.customerUser.memberships.length} workspace
                    {detail.customerUser.memberships.length === 1 ? "" : "s"}
                  </p>
                  {detail.customerUser.suspendedAt ? (
                    <p className="mt-1 font-mono text-[11px] text-danger">
                      suspended · {detail.customerUser.suspensionReason}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-[6px] border border-border-subtle bg-bg p-[10px] text-[12px] text-fg-faint">
                No Produktive account matched this email.
              </div>
            )}

            {detail.customerUser?.memberships.length ? (
              <div>
                <p className="mb-[6px] text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                  Workspaces
                </p>
                <div className="flex flex-col gap-[4px]">
                  {detail.customerUser.memberships.slice(0, 4).map((membership) => (
                    <div
                      key={membership.organizationId}
                      className="rounded-[5px] border border-border-subtle bg-bg p-[8px] text-[12px]"
                    >
                      <p className="truncate text-fg">{membership.organizationName}</p>
                      <p className="truncate font-mono text-[11px] text-fg-faint">
                        /{membership.organizationSlug} · {membership.role}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="py-6 text-[12px] text-fg-faint">No ticket selected</p>
        )}
      </Panel>
    </div>
  );
}

function ComposeSupportDialog({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    toEmail: string;
    customerName?: string;
    subject: string;
    bodyText: string;
    priority?: string;
  }) => void;
}) {
  const [toEmail, setToEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [priority, setPriority] = useState("normal");
  const canSubmit = Boolean(toEmail.trim() && subject.trim() && bodyText.trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    onSubmit({
      toEmail,
      customerName: customerName.trim() || undefined,
      subject,
      bodyText,
      priority,
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4">
      <form onSubmit={submit} className="w-full max-w-xl rounded-[8px] border border-border bg-bg p-5 shadow-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Produktive Support
        </p>
        <h3 className="mt-2 text-[18px] font-medium">Send customer email</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-[12px] text-fg-muted">
            To
            <input
              value={toEmail}
              onChange={(event) => setToEmail(event.target.value)}
              type="email"
              placeholder="customer@example.com"
              className="mt-1 h-9 w-full rounded-[6px] border border-border bg-surface px-3 text-[13px] text-fg outline-none focus:border-accent"
              autoFocus
            />
          </label>
          <label className="block text-[12px] text-fg-muted">
            Customer name
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Optional"
              className="mt-1 h-9 w-full rounded-[6px] border border-border bg-surface px-3 text-[13px] text-fg outline-none focus:border-accent"
            />
          </label>
        </div>
        <label className="mt-3 block text-[12px] text-fg-muted">
          Subject
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="How can we help?"
            className="mt-1 h-9 w-full rounded-[6px] border border-border bg-surface px-3 text-[13px] text-fg outline-none focus:border-accent"
          />
        </label>
        <label className="mt-3 block text-[12px] text-fg-muted">
          Priority
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="mt-1 h-9 w-full rounded-[6px] border border-border bg-surface px-2 text-[13px] text-fg outline-none focus:border-accent"
          >
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="mt-3 block text-[12px] text-fg-muted">
          Message
          <textarea
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
            placeholder="Write as Produktive Support..."
            className="mt-1 min-h-44 w-full resize-none rounded-[6px] border border-border bg-surface px-3 py-2 text-[13px] leading-6 text-fg outline-none focus:border-accent"
          />
        </label>
        <p className="mt-2 text-[11px] text-fg-faint">
          This creates a support ticket and sends from the configured Produktive support address.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[6px] px-3 text-[13px] text-fg-muted hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="h-9 rounded-[6px] bg-accent px-3 text-[13px] text-[#1a1410] disabled:opacity-50"
          >
            {busy ? "Sending..." : "Send email"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SuspensionDialog({
  target,
  busy,
  onClose,
  onSubmit,
}: {
  target: SuspensionTarget;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string, note?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const canSubmit = target.suspended || reason.trim().length > 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    onSubmit(reason, note || undefined);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-[8px] border border-border bg-bg p-5 shadow-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-danger">
          {target.suspended ? "Restore access" : "Suspend access"}
        </p>
        <h3 className="mt-2 text-[18px] font-medium">{target.label}</h3>
        {!target.suspended ? (
          <>
            <label className="mt-4 block text-[12px] text-fg-muted">
              Reason
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 h-9 w-full rounded-[6px] border border-border bg-surface px-3 text-[13px] text-fg outline-none focus:border-accent"
                autoFocus
              />
            </label>
            <label className="mt-3 block text-[12px] text-fg-muted">
              Internal note
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1 min-h-24 w-full resize-none rounded-[6px] border border-border bg-surface px-3 py-2 text-[13px] text-fg outline-none focus:border-accent"
              />
            </label>
          </>
        ) : (
          <p className="mt-3 text-[13px] leading-6 text-fg-muted">
            This will allow the target to authenticate and use Produktive again.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[6px] px-3 text-[13px] text-fg-muted hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="h-9 rounded-[6px] bg-danger px-3 text-[13px] text-white disabled:opacity-50"
          >
            {busy ? "Saving..." : target.suspended ? "Unsuspend" : "Suspend"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Panel({
  title,
  meta,
  action,
  children,
  noPad,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
  noPad?: boolean;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[8px] border border-border bg-surface">
      <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-border-subtle pl-4 pr-[14px]">
        <div className="flex min-w-0 items-baseline gap-[10px]">
          <h3 className="m-0 text-[13px] font-semibold tracking-tight text-fg">{title}</h3>
          {meta ? (
            <span className="font-mono text-[10.5px] text-fg-faint">{meta}</span>
          ) : null}
        </div>
        {action}
      </div>
      <div className={cn("min-h-0 flex-1", noPad ? "" : "px-4 py-[14px]")}>{children}</div>
    </section>
  );
}

function Kpi({
  label,
  value,
  delta,
  spark = [],
  tone,
}: {
  label: string;
  value: number | undefined;
  delta?: number;
  spark?: number[];
  tone?: "danger";
}) {
  const display = value == null ? "—" : fmtCount(value);
  const w = 120;
  const h = 32;
  const max = Math.max(...spark, 1);
  const min = Math.min(...spark, 0);
  const range = max - min || 1;
  const points = spark
    .map((v, i) => {
      const x = (i / Math.max(spark.length - 1, 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const accent = tone === "danger" ? "var(--color-danger)" : "var(--color-accent)";
  const id = `sg-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <section className="relative flex min-h-[110px] flex-col gap-2 overflow-hidden rounded-[8px] border border-border bg-surface px-4 pb-3 pt-[14px]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">{label}</span>
        {delta != null ? (
          <span
            className={cn(
              "font-mono text-[11px]",
              delta >= 0 ? "text-success" : "text-danger",
            )}
          >
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "m-0 text-[28px] font-semibold leading-none tracking-tight",
          tone === "danger" ? "text-danger" : "text-fg",
        )}
      >
        {display}
      </p>
      {spark.length > 1 ? (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          height={h}
          preserveAspectRatio="none"
          className="mt-auto block"
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.25" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${points} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
          <path d={points} fill="none" stroke={accent} strokeWidth="1.5" />
        </svg>
      ) : (
        <div className="mt-auto h-[32px]" />
      )}
    </section>
  );
}

function GrowthChart({
  points,
  metric,
  loading,
}: {
  points: GrowthPoint[];
  metric: "users" | "organizations";
  loading: boolean;
}) {
  const data = points.length ? points : [];
  if (!data.length) {
    return (
      <div className="grid h-[220px] place-items-center text-[12px] text-fg-faint">
        {loading ? "Loading growth data..." : "No growth data yet."}
      </div>
    );
  }
  const W = 720;
  const H = 220;
  const P = { l: 40, r: 16, t: 16, b: 28 };
  const vals = data.map((d) => d[metric]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const stepX = (W - P.l - P.r) / Math.max(data.length - 1, 1);
  const yFor = (v: number) => P.t + (H - P.t - P.b) * (1 - (v - min) / range);
  const path = data
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${(P.l + i * stepX).toFixed(1)},${yFor(d[metric]).toFixed(1)}`,
    )
    .join(" ");
  const area = `${path} L${(P.l + (data.length - 1) * stepX).toFixed(1)},${H - P.b} L${P.l},${H - P.b} Z`;
  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => min + (range * i) / yTicks);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block">
      <defs>
        <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {tickVals.map((v, i) => (
        <g key={i}>
          <line
            x1={P.l}
            x2={W - P.r}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke="var(--color-border-subtle)"
            strokeDasharray="2 4"
          />
          <text
            x={P.l - 8}
            y={yFor(v) + 3}
            textAnchor="end"
            fontSize="10"
            fontFamily="var(--font-mono)"
            fill="var(--color-fg-faint)"
          >
            {fmtCount(Math.round(v))}
          </text>
        </g>
      ))}
      {data.map((d, i) =>
        i % Math.max(1, Math.ceil(data.length / 8)) === 0 ? (
          <text
            key={d.bucket}
            x={P.l + i * stepX}
            y={H - 10}
            textAnchor="middle"
            fontSize="9.5"
            fontFamily="var(--font-mono)"
            fill="var(--color-fg-faint)"
          >
            {bucketLabel(d.bucket)}
          </text>
        ) : null,
      )}
      <path d={area} fill="url(#growthGrad)" />
      <path d={path} stroke="var(--color-accent)" strokeWidth="1.75" fill="none" />
      {data.length ? (
        <circle
          cx={P.l + (data.length - 1) * stepX}
          cy={yFor(data[data.length - 1][metric])}
          r="3"
          fill="var(--color-accent)"
          stroke="var(--color-bg)"
          strokeWidth="2"
        />
      ) : null}
    </svg>
  );
}

function StatusDot({ kind }: { kind: SupportTicketSummary["status"] | "active" | "suspended" }) {
  const map: Record<string, { bg: string; dot: string; fg: string; label: string }> = {
    active: {
      bg: "rgba(70,176,122,0.16)",
      dot: "var(--color-success)",
      fg: "#7fd1a3",
      label: "Active",
    },
    suspended: {
      bg: "rgba(224,89,74,0.16)",
      dot: "var(--color-danger)",
      fg: "#f08a7d",
      label: "Suspended",
    },
    open: {
      bg: "rgba(241,198,170,0.14)",
      dot: "var(--color-accent)",
      fg: "var(--color-accent)",
      label: "Open",
    },
    pending: {
      bg: "rgba(212,162,58,0.16)",
      dot: "var(--color-warning)",
      fg: "#e4be6c",
      label: "Pending",
    },
    closed: {
      bg: "rgba(138,138,144,0.14)",
      dot: "var(--color-fg-muted)",
      fg: "var(--color-fg-muted)",
      label: "Closed",
    },
  };
  const s = map[kind] ?? map.active;
  return (
    <span
      className="inline-flex h-[22px] items-center gap-[6px] rounded-[5px] pl-[7px] pr-2 text-[11px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      <span
        className="h-[6px] w-[6px] rounded-full"
        style={{ background: s.dot, boxShadow: `0 0 0 2px ${s.bg}` }}
      />
      {s.label}
    </span>
  );
}

function PriorityChip({ priority }: { priority: SupportTicketSummary["priority"] }) {
  const map: Record<string, { fg: string; bd: string; label: string }> = {
    urgent: { fg: "#f08a7d", bd: "rgba(224,89,74,0.45)", label: "Urgent" },
    high: { fg: "#e4be6c", bd: "rgba(212,162,58,0.45)", label: "High" },
    normal: { fg: "var(--color-fg-muted)", bd: "rgba(138,138,144,0.30)", label: "Normal" },
  };
  const s = map[priority] ?? map.normal;
  return (
    <span
      className="inline-flex h-[20px] items-center rounded-[4px] px-[7px] font-mono text-[10px] uppercase tracking-[0.06em]"
      style={{ border: `1px solid ${s.bd}`, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-[6px] border px-[10px] text-[12px] font-medium capitalize",
        active
          ? "border-accent/45 bg-accent/10 text-accent"
          : "border-border-subtle text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Btn({
  kind = "default",
  size = "md",
  onClick,
  children,
  disabled,
}: {
  kind?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const styles =
    kind === "primary"
      ? "bg-accent text-[#1a1410] border-transparent"
      : kind === "danger"
        ? "border-danger/45 bg-danger/10 text-danger"
        : kind === "ghost"
          ? "border-transparent text-fg-muted hover:bg-surface"
          : "border-border bg-surface-2 text-fg hover:bg-surface";
  const h = size === "sm" ? "h-[26px] px-[9px] text-[11.5px]" : "h-8 px-3 text-[13px]";
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-[6px] whitespace-nowrap rounded-[6px] border font-medium disabled:opacity-50",
        styles,
        h,
      )}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: number | string | undefined;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[6px] border border-border-subtle bg-bg px-[10px] py-2">
      <p className="mb-[3px] text-[10px] uppercase tracking-[0.08em] text-fg-faint">{label}</p>
      <p
        className={cn(
          "m-0 text-[14px] font-medium text-fg",
          mono && "font-mono",
        )}
      >
        {value == null || value === "" ? "—" : value}
      </p>
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-[5px] border border-border-subtle px-2 text-[11px] capitalize text-fg-muted">
      {children}
    </span>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
  width,
  kbd,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number;
  kbd?: string;
}) {
  return (
    <div className="relative" style={{ width: width ?? "100%" }}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="absolute left-[10px] top-1/2 -translate-y-1/2 text-fg-faint"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="block h-8 w-full rounded-[6px] border border-border-subtle bg-bg pl-[30px] pr-3 text-[13px] text-fg outline-none focus:border-accent"
      />
      {kbd ? (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[3px] border border-border-subtle bg-surface-2 px-[5px] py-px font-mono text-[10px] text-fg-faint">
          {kbd}
        </span>
      ) : null}
    </div>
  );
}

function OrgGlyph({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-[6px] border border-border-subtle bg-surface-2 font-mono font-semibold text-fg"
      style={{ width: size, height: size, fontSize: size * 0.42, flexShrink: 0 }}
    >
      {(name || "?")[0]?.toUpperCase()}
    </span>
  );
}

function Avatar({
  name,
  seed,
  size = 28,
}: {
  name: string;
  seed?: string;
  size?: number;
}) {
  const hues = [12, 32, 52, 196, 220, 268, 320];
  const key = (seed || name || "").split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hue = hues[key % hues.length];
  const initials = (name || "")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="inline-grid flex-shrink-0 place-items-center rounded-[5px] font-mono font-semibold"
      style={{
        width: size,
        height: size,
        background: `oklch(0.32 0.06 ${hue})`,
        color: `oklch(0.92 0.06 ${hue})`,
        fontSize: size * 0.4,
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {initials || "?"}
    </span>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  return (
    <div className="flex items-center gap-[10px] border-b border-border-subtle py-[6px] text-[11.5px]">
      <span className="w-[110px] font-mono text-fg-muted">{event.action}</span>
      <span className="min-w-0 flex-1 truncate text-fg-faint">
        {event.issueTitle ?? event.issueId}
      </span>
      <span className="font-mono text-[10px] text-fg-faint">
        {relativeShort(event.createdAt)}
      </span>
    </div>
  );
}

type IconName =
  | "grid"
  | "users"
  | "building"
  | "inbox"
  | "shield"
  | "search"
  | "logout";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "grid":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "building":
      return (
        <svg {...props}>
          <rect x="4" y="2" width="16" height="20" rx="1" />
          <path d="M9 22v-4h6v4" />
          <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...props}>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "logout":
      return (
        <svg {...props}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
  }
}

function AdminShellState({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6 text-fg">
      <section className="w-full max-w-md rounded-[8px] border border-border-subtle bg-surface/50 p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-danger">
          Platform admin
        </p>
        <h1 className="mt-3 text-[20px] font-medium">{title}</h1>
        <p className="mt-2 text-[13px] text-fg-muted">{message}</p>
        {children ? <div className="mt-5">{children}</div> : null}
      </section>
    </main>
  );
}

function fmtCount(n: number | undefined | null) {
  if (n == null) return "—";
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function deltaPercent(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const first = values[0];
  const last = values[values.length - 1];
  if (!first) return undefined;
  return ((last - first) / first) * 100;
}

function bucketLabel(bucket: string) {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function shortDate(value: string | null) {
  if (!value) return "never";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

function longDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeShort(value: string | null) {
  if (!value) return "—";
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 0) return "now";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d`;
  const mo = Math.round(day / 30);
  return `${mo}mo`;
}

function actionDot(action: string) {
  const a = action.toLowerCase();
  if (a.includes("suspend") || a.includes("delete") || a.includes("fail")) return "bg-danger";
  if (a.includes("login") || a.includes("session")) return "bg-accent";
  return "bg-success";
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
