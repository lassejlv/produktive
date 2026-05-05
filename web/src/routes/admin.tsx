import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  type ActivityEvent,
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
  const supportTickets = useQuery({
    queryKey: ["admin", "support", "tickets", supportSearch, supportStatus],
    queryFn: () =>
      listSupportTickets({
        search: supportSearch,
        status: supportStatus === "all" ? undefined : supportStatus,
      }),
    enabled: admin.isSuccess,
  });
  const supportDetail = useQuery({
    queryKey: ["admin", "support", "ticket", selectedTicketId],
    queryFn: () => getSupportTicket(selectedTicketId!),
    enabled: Boolean(selectedTicketId) && admin.isSuccess,
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
  const recentUsers = users.data?.users.slice(0, 6) ?? [];
  const recentOrgs = organizations.data?.organizations.slice(0, 6) ?? [];

  return (
    <main className="min-h-screen bg-bg text-fg">
      <div className="grid min-h-screen grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-r border-border-subtle bg-sidebar px-3 py-4">
          <div className="mb-6 px-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-danger">
              Platform admin
            </p>
            <h1 className="mt-2 text-[18px] font-semibold tracking-tight">Produktive Ops</h1>
            <p className="mt-1 truncate text-[12px] text-fg-muted">{adminData.user.email}</p>
          </div>
          <nav className="space-y-1">
            {(["overview", "users", "organizations", "support", "audit"] as Section[]).map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSection(item)}
                  className={cn(
                    "flex h-8 w-full items-center justify-between rounded-[6px] px-2 text-left text-[13px] capitalize transition-colors",
                    section === item ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface",
                  )}
                >
                  {item}
                  {item === "users" && totals ? <Badge>{totals.users}</Badge> : null}
                  {item === "organizations" && totals ? (
                    <Badge>{totals.organizations}</Badge>
                  ) : null}
                  {item === "support" ? (
                    <Badge>{supportTickets.data?.page.total ?? 0}</Badge>
                  ) : null}
                </button>
              ),
            )}
          </nav>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-8 h-8 rounded-[6px] px-2 text-left text-[12px] text-fg-muted hover:bg-surface"
          >
            Sign out
          </button>
        </aside>

        <section className="min-w-0 overflow-hidden">
          <header className="flex h-14 items-center justify-between border-b border-border-subtle px-6">
            <div>
              <h2 className="text-[15px] font-medium capitalize">{section}</h2>
              <p className="text-[11px] text-fg-faint">{adminData.role.replace("_", " ")} access</p>
            </div>
            <div className="flex items-center gap-2">
              {["30d", "90d", "12m"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={cn(
                    "h-7 rounded-[6px] border px-2 font-mono text-[11px]",
                    range === item
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border-subtle text-fg-muted hover:bg-surface",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </header>

          <div className="h-[calc(100vh-56px)] overflow-auto px-6 py-5">
            {section === "overview" ? (
              <Overview
                totals={totals}
                points={growth.data?.points ?? []}
                recentUsers={recentUsers}
                recentOrgs={recentOrgs}
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
              <AuditView events={audit.data?.events ?? []} isLoading={audit.isLoading} />
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
                updateBusy={supportUpdateMutation.isPending}
                retryBusy={supportRetryMutation.isPending}
                onSearch={setSupportSearch}
                onStatus={setSupportStatus}
                onSelect={setSelectedTicketId}
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
          </div>
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
    </main>
  );
}

function Overview({
  totals,
  points,
  recentUsers,
  recentOrgs,
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
  recentUsers: AdminUserSummary[];
  recentOrgs: AdminOrganizationSummary[];
  isLoading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Metric label="Users" value={totals?.users} />
        <Metric label="Organizations" value={totals?.organizations} />
        <Metric label="Suspended users" value={totals?.suspendedUsers} tone="danger" />
        <Metric label="Suspended orgs" value={totals?.suspendedOrganizations} tone="danger" />
      </div>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)] gap-4">
        <section className="border border-border-subtle bg-surface/40 p-4">
          <PanelTitle title="Growth" meta={isLoading ? "loading" : `${points.length} buckets`} />
          <GrowthChart points={points} />
        </section>
        <section className="border border-border-subtle bg-surface/40 p-4">
          <PanelTitle title="Recent organizations" meta={`${recentOrgs.length} shown`} />
          <CompactOrgList organizations={recentOrgs} />
        </section>
      </div>
      <section className="border border-border-subtle bg-surface/40 p-4">
        <PanelTitle title="Recent users" meta={`${recentUsers.length} shown`} />
        <CompactUserList users={recentUsers} />
      </section>
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
    <div className="grid grid-cols-[minmax(0,1fr)_390px] gap-4">
      <section className="min-w-0 border border-border-subtle bg-surface/35">
        <TableToolbar
          total={pageTotal}
          search={search}
          status={status}
          onSearch={onSearch}
          onStatus={onStatus}
        />
        <table className="w-full table-fixed text-left text-[12px]">
          <thead className="border-y border-border-subtle text-[10px] uppercase tracking-[0.12em] text-fg-faint">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="w-24 px-3 py-2">Status</th>
              <th className="w-20 px-3 py-2">Orgs</th>
              <th className="w-32 px-3 py-2">Last seen</th>
              <th className="w-28 px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                onClick={() => onSelect(user.id)}
                className={cn(
                  "cursor-pointer border-b border-border-subtle/70 hover:bg-surface",
                  selected === user.id && "bg-surface",
                )}
              >
                <td className="min-w-0 px-3 py-2">
                  <p className="truncate text-fg">{user.name}</p>
                  <p className="truncate text-fg-faint">{user.email}</p>
                </td>
                <td className="px-3 py-2">
                  <Status suspended={Boolean(user.suspendedAt)} />
                </td>
                <td className="px-3 py-2 font-mono text-fg-muted">{user.organizationCount}</td>
                <td className="px-3 py-2 text-fg-muted">{shortDate(user.lastSessionAt)}</td>
                <td className="px-3 py-2 text-fg-muted">{shortDate(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading ? <p className="p-4 text-[12px] text-fg-faint">Loading users...</p> : null}
      </section>
      <DetailPanel title="User detail">
        {detail ? (
          <div className="space-y-4">
            <IdentityBlock title={detail.user.name} subtitle={detail.user.email} />
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Active sessions" value={detail.sessions.active} />
              <MiniStat label="Revoked sessions" value={detail.sessions.revoked} />
              <MiniStat label="Memberships" value={detail.memberships.length} />
              <MiniStat label="Activity events" value={detail.activityEvents.length} />
            </div>
            <button
              type="button"
              onClick={() =>
                onSuspend({
                  type: "user",
                  id: detail.user.id,
                  label: detail.user.email,
                  suspended: Boolean(detail.user.suspendedAt),
                })
              }
              className={cn(
                "h-9 w-full rounded-[6px] border text-[13px]",
                detail.user.suspendedAt
                  ? "border-success/50 text-success hover:bg-success/10"
                  : "border-danger/50 text-danger hover:bg-danger/10",
              )}
            >
              {detail.user.suspendedAt ? "Unsuspend user" : "Suspend user"}
            </button>
            <PanelTitle title="Organizations" meta={`${detail.memberships.length}`} />
            <div className="space-y-2">
              {detail.memberships.map((membership) => (
                <div key={membership.organizationId} className="border border-border-subtle p-2">
                  <p className="truncate text-[12px] text-fg">{membership.organizationName}</p>
                  <p className="text-[11px] text-fg-faint">{membership.role}</p>
                </div>
              ))}
            </div>
            <AuditMini events={detail.auditEvents} />
            <ActivityMini events={detail.activityEvents} />
          </div>
        ) : (
          <EmptyDetail label="Select a user" />
        )}
      </DetailPanel>
    </div>
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
    <div className="grid grid-cols-[minmax(0,1fr)_390px] gap-4">
      <section className="min-w-0 border border-border-subtle bg-surface/35">
        <TableToolbar
          total={pageTotal}
          search={search}
          status={status}
          onSearch={onSearch}
          onStatus={onStatus}
        />
        <table className="w-full table-fixed text-left text-[12px]">
          <thead className="border-y border-border-subtle text-[10px] uppercase tracking-[0.12em] text-fg-faint">
            <tr>
              <th className="px-3 py-2">Organization</th>
              <th className="w-24 px-3 py-2">Status</th>
              <th className="w-20 px-3 py-2">Members</th>
              <th className="w-20 px-3 py-2">Issues</th>
              <th className="w-28 px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr
                key={org.id}
                onClick={() => onSelect(org.id)}
                className={cn(
                  "cursor-pointer border-b border-border-subtle/70 hover:bg-surface",
                  selected === org.id && "bg-surface",
                )}
              >
                <td className="min-w-0 px-3 py-2">
                  <p className="truncate text-fg">{org.name}</p>
                  <p className="truncate text-fg-faint">{org.slug}</p>
                </td>
                <td className="px-3 py-2">
                  <Status suspended={Boolean(org.suspendedAt)} />
                </td>
                <td className="px-3 py-2 font-mono text-fg-muted">{org.memberCount}</td>
                <td className="px-3 py-2 font-mono text-fg-muted">{org.issueCount}</td>
                <td className="px-3 py-2 text-fg-muted">{shortDate(org.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading ? (
          <p className="p-4 text-[12px] text-fg-faint">Loading organizations...</p>
        ) : null}
      </section>
      <DetailPanel title="Organization detail">
        {detail ? (
          <div className="space-y-4">
            <IdentityBlock title={detail.organization.name} subtitle={detail.organization.slug} />
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Members" value={detail.organization.memberCount} />
              <MiniStat label="Issues" value={detail.organization.issueCount} />
              <MiniStat label="Owners" value={detail.organization.ownerCount} />
              <MiniStat label="Projects" value={detail.organization.projectCount} />
              <MiniStat label="Active sessions" value={detail.sessions.active} />
              <MiniStat label="Activity events" value={detail.activityEvents.length} />
            </div>
            <button
              type="button"
              onClick={() =>
                onSuspend({
                  type: "organization",
                  id: detail.organization.id,
                  label: detail.organization.name,
                  suspended: Boolean(detail.organization.suspendedAt),
                })
              }
              className={cn(
                "h-9 w-full rounded-[6px] border text-[13px]",
                detail.organization.suspendedAt
                  ? "border-success/50 text-success hover:bg-success/10"
                  : "border-danger/50 text-danger hover:bg-danger/10",
              )}
            >
              {detail.organization.suspendedAt ? "Unsuspend organization" : "Suspend organization"}
            </button>
            <PanelTitle title="Members" meta={`${detail.members.length}`} />
            <div className="max-h-56 space-y-2 overflow-auto">
              {detail.members.map((member) => (
                <div key={member.id} className="border border-border-subtle p-2">
                  <p className="truncate text-[12px] text-fg">{member.name}</p>
                  <p className="truncate text-[11px] text-fg-faint">{member.email}</p>
                </div>
              ))}
            </div>
            <PanelTitle title="Owners" meta={`${detail.owners.length}`} />
            <div className="space-y-2">
              {detail.owners.map((owner) => (
                <div key={owner.id} className="border border-border-subtle p-2">
                  <p className="truncate text-[12px] text-fg">{owner.name}</p>
                  <p className="truncate text-[11px] text-fg-faint">{owner.email}</p>
                </div>
              ))}
            </div>
            <AuditMini events={detail.auditEvents} />
            <ActivityMini events={detail.activityEvents} />
          </div>
        ) : (
          <EmptyDetail label="Select an organization" />
        )}
      </DetailPanel>
    </div>
  );
}

function AuditView({ events, isLoading }: { events: AuditEvent[]; isLoading: boolean }) {
  return (
    <section className="border border-border-subtle bg-surface/35">
      <PanelTitle title="Audit log" meta={isLoading ? "loading" : `${events.length} events`} />
      <div className="divide-y divide-border-subtle">
        {events.map((event) => (
          <div
            key={event.id}
            className="grid grid-cols-[180px_1fr_220px] gap-4 px-4 py-3 text-[12px]"
          >
            <div>
              <p className="text-fg">{event.action}</p>
              <p className="text-fg-faint">{shortDate(event.createdAt)}</p>
            </div>
            <div>
              <p className="text-fg-muted">{event.reason ?? "No reason recorded"}</p>
              <p className="font-mono text-[11px] text-fg-faint">
                {event.targetType}:{event.targetId}
              </p>
            </div>
            <p className="truncate text-fg-faint">{event.actor.email}</p>
          </div>
        ))}
      </div>
    </section>
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
  updateBusy,
  retryBusy,
  onSearch,
  onStatus,
  onSelect,
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
  updateBusy: boolean;
  retryBusy: boolean;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onSelect: (value: string) => void;
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
  const selectedTicket = detail?.ticket;

  const submitReply = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim() || replyBusy) return;
    onReply(reply, closeAfterReply);
    setReply("");
    setCloseAfterReply(false);
  };

  return (
    <div className="grid grid-cols-[360px_minmax(0,1fr)_280px] gap-4">
      <section className="min-w-0 border border-border-subtle bg-surface/35">
        <div className="space-y-3 p-3">
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search tickets"
            className="h-9 w-full rounded-[6px] border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent"
          />
          <div className="grid grid-cols-4 gap-1">
            {["open", "pending", "closed", "all"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onStatus(item)}
                className={cn(
                  "h-8 rounded-[6px] border text-[11px] capitalize",
                  status === item
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border-subtle text-fg-muted hover:bg-surface",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="font-mono text-[11px] text-fg-faint">{pageTotal} tickets</p>
        </div>
        <div className="divide-y divide-border-subtle">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onSelect(ticket.id)}
              className={cn(
                "block w-full px-3 py-3 text-left hover:bg-surface",
                selected === ticket.id && "bg-surface",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] text-fg">{ticket.subject}</p>
                <TicketStatus status={ticket.status} />
              </div>
              <p className="mt-1 truncate text-[12px] text-fg-faint">
                {ticket.customerName ?? ticket.customerEmail}
              </p>
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-fg-faint">
                <span>{ticket.number}</span>
                <span>{shortDate(ticket.lastMessageAt)}</span>
              </div>
            </button>
          ))}
          {isLoading ? <p className="p-4 text-[12px] text-fg-faint">Loading tickets...</p> : null}
          {!isLoading && tickets.length === 0 ? (
            <p className="p-4 text-[12px] text-fg-faint">No support tickets.</p>
          ) : null}
        </div>
      </section>

      <section className="min-w-0 border border-border-subtle bg-surface/35">
        {detail ? (
          <div className="flex h-[calc(100vh-120px)] flex-col">
            <div className="border-b border-border-subtle p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-fg-faint">{detail.ticket.number}</p>
                  <h3 className="mt-1 truncate text-[18px] font-medium">{detail.ticket.subject}</h3>
                  <p className="mt-1 truncate text-[12px] text-fg-faint">
                    {detail.ticket.customerEmail}
                  </p>
                </div>
                <TicketStatus status={detail.ticket.status} />
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
              {detail.messages.map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    "max-w-[78%] border border-border-subtle p-3",
                    message.direction === "outbound" ? "ml-auto bg-accent/10" : "bg-bg",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
                    <p className="truncate text-fg-muted">
                      {message.direction === "outbound" ? message.toEmail : message.fromEmail}
                    </p>
                    <span className="font-mono text-fg-faint">{shortDate(message.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] leading-6 text-fg">
                    {message.bodyText ?? stripHtml(message.bodyHtml ?? "")}
                  </p>
                  {message.deliveryStatus === "failed" ? (
                    <div className="mt-3 border border-danger/40 bg-danger/10 p-2 text-[11px] text-danger">
                      <p>{message.deliveryError ?? "Email send failed"}</p>
                      <button
                        type="button"
                        disabled={retryBusy}
                        onClick={() => onRetry(message.id)}
                        className="mt-2 h-7 rounded-[6px] border border-danger/50 px-2 disabled:opacity-50"
                      >
                        Retry send
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 font-mono text-[10px] text-fg-faint">
                      {message.deliveryStatus}
                    </p>
                  )}
                </article>
              ))}
            </div>
            <form onSubmit={submitReply} className="border-t border-border-subtle p-3">
              <textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Reply to customer..."
                className="min-h-28 w-full resize-none rounded-[6px] border border-border bg-bg px-3 py-2 text-[13px] leading-6 text-fg outline-none focus:border-accent"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[12px] text-fg-muted">
                  <input
                    type="checkbox"
                    checked={closeAfterReply}
                    onChange={(event) => setCloseAfterReply(event.target.checked)}
                  />
                  Close after reply
                </label>
                <button
                  type="submit"
                  disabled={!reply.trim() || replyBusy}
                  className="h-9 rounded-[6px] bg-accent px-3 text-[13px] text-white disabled:opacity-50"
                >
                  {replyBusy ? "Sending..." : "Send reply"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <EmptyDetail label="Select a ticket" />
        )}
      </section>

      <aside className="border border-border-subtle bg-surface/35 p-4">
        {selectedTicket ? (
          <div className="space-y-4">
            <PanelTitle title="Ticket" meta={selectedTicket.number} />
            <label className="block text-[12px] text-fg-muted">
              Status
              <select
                value={selectedTicket.status}
                disabled={updateBusy}
                onChange={(event) => onUpdate({ status: event.target.value })}
                className="mt-1 h-9 w-full rounded-[6px] border border-border bg-bg px-2 text-[12px] text-fg"
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label className="block text-[12px] text-fg-muted">
              Priority
              <select
                value={selectedTicket.priority}
                disabled={updateBusy}
                onChange={(event) => onUpdate({ priority: event.target.value })}
                className="mt-1 h-9 w-full rounded-[6px] border border-border bg-bg px-2 text-[12px] text-fg"
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <div className="border border-border-subtle p-3 text-[12px]">
              <p className="text-fg-faint">Customer</p>
              <p className="mt-1 truncate text-fg">{selectedTicket.customerName ?? "Unknown"}</p>
              <p className="truncate text-fg-muted">{selectedTicket.customerEmail}</p>
            </div>
            <div className="border border-border-subtle p-3 text-[12px]">
              <p className="text-fg-faint">Assigned</p>
              <p className="mt-1 truncate text-fg-muted">
                {detail?.assignedAdmin?.email ?? "Unassigned"}
              </p>
            </div>
            <PanelTitle title="Events" meta={`${detail?.events.length ?? 0}`} />
            <div className="max-h-72 space-y-2 overflow-auto">
              {detail?.events.map((event) => (
                <div key={event.id} className="border border-border-subtle p-2">
                  <p className="text-[12px] text-fg">{event.eventType.replace(/_/g, " ")}</p>
                  <p className="font-mono text-[10px] text-fg-faint">
                    {shortDate(event.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyDetail label="No ticket selected" />
        )}
      </aside>
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
      <form onSubmit={submit} className="w-full max-w-md border border-border bg-bg p-5 shadow-2xl">
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

function GrowthChart({ points }: { points: GrowthPoint[] }) {
  const max = Math.max(1, ...points.map((point) => Math.max(point.users, point.organizations)));
  const bars = points.slice(-18);
  return (
    <div className="mt-4 h-72">
      <div className="flex h-60 items-end gap-2 border-b border-border-subtle">
        {bars.length === 0 ? (
          <p className="pb-4 text-[12px] text-fg-faint">No growth data yet.</p>
        ) : (
          bars.map((point) => (
            <div key={point.bucket} className="flex min-w-0 flex-1 items-end gap-1">
              <div
                title={`${point.bucket}: ${point.users} users`}
                className="min-h-1 flex-1 bg-accent"
                style={{ height: `${(point.users / max) * 100}%` }}
              />
              <div
                title={`${point.bucket}: ${point.organizations} orgs`}
                className="min-h-1 flex-1 bg-success"
                style={{ height: `${(point.organizations / max) * 100}%` }}
              />
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-fg-muted">
        <span className="flex items-center gap-1">
          <i className="h-2 w-2 bg-accent" /> Users
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2 w-2 bg-success" /> Organizations
        </span>
      </div>
    </div>
  );
}

function TableToolbar({
  total,
  search,
  status,
  onSearch,
  onStatus,
}: {
  total: number;
  search: string;
  status: string;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3">
      <input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Search"
        className="h-9 min-w-0 flex-1 rounded-[6px] border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent"
      />
      <select
        value={status}
        onChange={(event) => onStatus(event.target.value)}
        className="h-9 rounded-[6px] border border-border bg-bg px-2 text-[12px] text-fg"
      >
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="suspended">Suspended</option>
      </select>
      <span className="font-mono text-[11px] text-fg-faint">{total} total</span>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value?: number; tone?: "danger" }) {
  return (
    <section className="border border-border-subtle bg-surface/40 p-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-fg-faint">{label}</p>
      <p
        className={cn(
          "mt-4 font-mono text-[30px] leading-none",
          tone === "danger" && "text-danger",
        )}
      >
        {value ?? "..."}
      </p>
    </section>
  );
}

function PanelTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <h3 className="text-[13px] font-medium">{title}</h3>
      {meta ? <span className="font-mono text-[10px] text-fg-faint">{meta}</span> : null}
    </div>
  );
}

function DetailPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="min-h-[560px] border border-border-subtle bg-surface/35 p-4">
      <PanelTitle title={title} />
      {children}
    </aside>
  );
}

function CompactUserList({ users }: { users: AdminUserSummary[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {users.map((user) => (
        <div key={user.id} className="border border-border-subtle p-3">
          <p className="truncate text-[13px] text-fg">{user.name}</p>
          <p className="truncate text-[12px] text-fg-faint">{user.email}</p>
        </div>
      ))}
    </div>
  );
}

function CompactOrgList({ organizations }: { organizations: AdminOrganizationSummary[] }) {
  return (
    <div className="space-y-2">
      {organizations.map((org) => (
        <div
          key={org.id}
          className="flex items-center justify-between border border-border-subtle p-2"
        >
          <div className="min-w-0">
            <p className="truncate text-[12px] text-fg">{org.name}</p>
            <p className="truncate text-[11px] text-fg-faint">{org.slug}</p>
          </div>
          <span className="font-mono text-[11px] text-fg-muted">{org.memberCount}</span>
        </div>
      ))}
    </div>
  );
}

function AuditMini({ events }: { events: AuditEvent[] }) {
  return (
    <div>
      <PanelTitle title="Audit" meta={`${events.length}`} />
      <div className="space-y-2">
        {events.map((event) => (
          <div key={event.id} className="border border-border-subtle p-2 text-[11px]">
            <p className="text-fg">{event.action}</p>
            <p className="truncate text-fg-faint">{event.reason ?? event.actor.email}</p>
            {event.metadata?.emailSent !== undefined ? (
              <p className="font-mono text-[10px] text-fg-faint">
                email: {event.metadata.emailSent ? "sent" : "failed"}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityMini({ events }: { events: ActivityEvent[] }) {
  return (
    <div>
      <PanelTitle title="Activity events" meta={`${events.length}`} />
      <div className="max-h-56 space-y-2 overflow-auto">
        {events.map((event) => (
          <div key={event.id} className="border border-border-subtle p-2 text-[11px]">
            <p className="text-fg">{event.action}</p>
            <p className="truncate text-fg-faint">{event.issueTitle ?? event.issueId}</p>
            <p className="font-mono text-[10px] text-fg-faint">{shortDate(event.createdAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function IdentityBlock({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border border-border-subtle p-3">
      <p className="truncate text-[15px] text-fg">{title}</p>
      <p className="truncate text-[12px] text-fg-faint">{subtitle}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border-subtle p-3">
      <p className="text-[11px] text-fg-faint">{label}</p>
      <p className="mt-2 font-mono text-[20px] text-fg">{value}</p>
    </div>
  );
}

function Status({ suspended }: { suspended: boolean }) {
  return (
    <span className={cn("font-mono text-[10px]", suspended ? "text-danger" : "text-success")}>
      {suspended ? "suspended" : "active"}
    </span>
  );
}

function TicketStatus({ status }: { status: SupportTicketSummary["status"] }) {
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-[10px]",
        status === "closed"
          ? "text-fg-faint"
          : status === "pending"
            ? "text-accent"
            : "text-success",
      )}
    >
      {status}
    </span>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10px] text-fg-faint">{children}</span>;
}

function EmptyDetail({ label }: { label: string }) {
  return <p className="mt-6 text-center text-[12px] text-fg-faint">{label}</p>;
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
      <section className="w-full max-w-md border border-border-subtle bg-surface/50 p-6 text-center">
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

function shortDate(value: string | null) {
  if (!value) return "never";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
