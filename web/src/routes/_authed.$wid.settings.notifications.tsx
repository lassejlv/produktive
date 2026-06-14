import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  ChevronDown,
  Hash,
  type LucideIcon,
  MessagesSquare,
  PauseCircle,
  Plus,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { PageActions } from "../components/PageLayout";
import { Segmented } from "../components/Segmented";
import { Spinner } from "../components/Spinner";
import { StatTile } from "../components/StatTile";
import { cn } from "#/lib/cn";
import {
  notificationChannelsQuery,
  notificationsQuery,
  useCreateNotificationChannel,
  useDeleteNotificationChannel,
  useNotificationChannels,
  useNotificationDeliveries,
  useNotifications,
  useTestNotificationChannel,
  useUpdateNotificationChannel,
  useWorkspaces,
} from "../lib/queries";
import { lastSeen } from "../lib/status";
import type { Notification, NotificationChannel } from "../lib/types";

const RECENT_LIMIT = 8;
const DEFAULT_CHANNEL_NAME = "Incident alerts";

export const Route = createFileRoute("/_authed/$wid/settings/notifications")({
  staticData: {
    title: "Settings",
    description: "Configure private notification channels for incident events.",
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(notificationChannelsQuery(params.wid)),
      context.queryClient.ensureQueryData(notificationsQuery(params.wid)),
    ]),
  component: SettingsPage,
});

type ChannelKind = "webhook" | "slack" | "discord";
type RecoveryMode = "open" | "all";

const KIND_META: Record<
  ChannelKind,
  { label: string; icon: LucideIcon; placeholder: string; hint: string }
> = {
  webhook: {
    label: "Webhook",
    icon: Webhook,
    placeholder: "https://hooks.example.com/incidents",
    hint: "Generic JSON POST with incident details.",
  },
  slack: {
    label: "Slack",
    icon: Hash,
    placeholder: "https://hooks.slack.com/services/T000/B000/XXXXXXXX",
    hint: "Paste a Slack Incoming Webhook URL.",
  },
  discord: {
    label: "Discord",
    icon: MessagesSquare,
    placeholder: "https://discord.com/api/webhooks/000000/XXXXXXXX",
    hint: "Paste a Discord channel webhook URL.",
  },
};

function channelMeta(kind: NotificationChannel["kind"]) {
  return kind === "unknown" ? KIND_META.webhook : KIND_META[kind];
}

function SettingsPage() {
  const { wid } = Route.useParams();
  const workspaces = useWorkspaces();
  const current = workspaces.data?.find((w) => w.id === wid || w.slug === wid);
  const isOwner = current?.role === "owner";

  const channels = useNotificationChannels(wid);
  const notifications = useNotifications(wid);
  const remove = useDeleteNotificationChannel(wid);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NotificationChannel | null>(null);

  const channelList = channels.data ?? [];
  const notificationList = notifications.data ?? [];
  const recentNotifications = notificationList.slice(0, RECENT_LIMIT);
  const activeCount = channelList.filter((c) => c.enabled).length;
  const recent24h = notificationList.filter(
    (n) => Date.now() - new Date(n.created_at).getTime() < 86_400_000,
  ).length;

  const loading = channels.isLoading || notifications.isLoading;

  return (
    <>
      <PageActions>
        {isOwner && (
          <Button type="button" variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Add channel
          </Button>
        )}
      </PageActions>

      <div className="flex flex-col gap-7">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Channels"
            value={loading ? "—" : String(channelList.length)}
            loading={loading}
          />
          <StatTile
            label="Active"
            value={loading ? "—" : String(activeCount)}
            accent={activeCount > 0 ? "var(--color-ok)" : undefined}
            loading={loading}
          />
          <StatTile
            label="Last 24 hours"
            value={loading ? "—" : String(recent24h)}
            sub={!loading && notificationList.length > 0 ? `${notificationList.length} total` : undefined}
            loading={loading}
          />
        </div>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section>
            <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              Notification channels
            </h3>

            {!isOwner && (
              <p className="mb-4 text-[12px] text-[var(--color-fg-muted)]">
                Only the workspace owner can add or remove notification channels.
              </p>
            )}

            {channels.isLoading ? (
              <LoadingBlock label="Loading channels…" />
            ) : channelList.length ? (
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
                <div className="grid grid-cols-[minmax(0,1fr)_90px_100px_110px_120px_minmax(120px,1fr)] border-b border-[var(--color-border)] bg-[var(--color-bg-row)] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)] max-lg:hidden">
                  <span>Channel</span>
                  <span>Type</span>
                  <span>Active</span>
                  <span>Recovery</span>
                  <span>Last delivery</span>
                  <span className="text-right">Actions</span>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {channelList.map((channel) => (
                    <ChannelRow key={channel.id} wid={wid} channel={channel} isOwner={isOwner} onDelete={() => setDeleteTarget(channel)} />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Bell}
                title="No notification channels"
                description="Add a webhook, Slack, or Discord channel to receive incident open and recovery events."
                action={
                  isOwner ? (
                    <Button type="button" variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus size={14} /> Add your first channel
                    </Button>
                  ) : undefined
                }
              />
            )}
          </section>

          <aside className="xl:sticky xl:top-8 xl:self-start">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
                Recent notifications
              </h3>
              {!notifications.isLoading && notificationList.length > 0 && (
                <span className="text-[11px] tabular text-[var(--color-fg-dim)]">
                  {Math.min(recentNotifications.length, notificationList.length)} shown
                </span>
              )}
            </div>

            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
              {notifications.isLoading ? (
                <LoadingBlock label="Loading notifications…" />
              ) : recentNotifications.length ? (
                <div className="divide-y divide-[var(--color-border)]">
                  {recentNotifications.map((n) => (
                    <NotificationFeedItem key={n.id} wid={wid} notification={n} />
                  ))}
                </div>
              ) : (
                <div className="px-4 py-10 text-center">
                  <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
                    <BellRing size={16} />
                  </div>
                  <p className="text-[13px] font-medium text-[var(--color-fg)]">No notifications yet</p>
                  <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
                    Events appear here when monitors open or resolve incidents.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      <AddChannelDialog
        wid={wid}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete notification channel?"
        description="Future incident events will no longer be sent to this channel."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          remove.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success("Notification channel deleted");
              setDeleteTarget(null);
            },
            onError: (err) => toast.error((err as Error).message),
          });
        }}
      />
    </>
  );
}

function ChannelRow({
  wid,
  channel,
  isOwner,
  onDelete,
}: {
  wid: string;
  channel: NotificationChannel;
  isOwner: boolean;
  onDelete: () => void;
}) {
  const update = useUpdateNotificationChannel(wid);
  const test = useTestNotificationChannel(wid);
  const [expanded, setExpanded] = useState(false);
  const deliveries = useNotificationDeliveries(wid, expanded ? channel.id : null);
  const meta = channelMeta(channel.kind);
  const Icon = meta.icon;
  const pending = update.isPending || test.isPending;

  function patch(body: { enabled?: boolean; notify_resolved?: boolean }) {
    update.mutate(
      { id: channel.id, ...body },
      { onError: (err) => toast.error((err as Error).message) },
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_90px_100px_110px_120px_minmax(120px,1fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]"
            title={meta.label}
          >
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">{channel.name}</div>
            <div className="mono mt-0.5 truncate text-[11px] text-[var(--color-fg-muted)]">
              {channel.masked_url}
            </div>
          </div>
        </div>

        <div className="text-[12px] text-[var(--color-fg-muted)] lg:text-[var(--color-fg)]">
          <span className="mr-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)] lg:hidden">
            Type
          </span>
          {meta.label}
        </div>

        <div>
          <span className="mr-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)] lg:hidden">
            Active
          </span>
          {isOwner ? (
            <Segmented<"on" | "off">
              size="sm"
              value={channel.enabled ? "on" : "off"}
              onChange={(v) => patch({ enabled: v === "on" })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          ) : channel.enabled ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg)]">
              <CheckCircle2 size={14} className="text-[var(--color-ok)]" /> On
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)]">
              <PauseCircle size={14} /> Off
            </span>
          )}
        </div>

        <div>
          <span className="mr-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)] lg:hidden">
            Recovery
          </span>
          {isOwner ? (
            <Segmented<"open" | "all">
              size="sm"
              value={channel.notify_resolved ? "all" : "open"}
              onChange={(v) => patch({ notify_resolved: v === "all" })}
              options={[
                { value: "open", label: "Open" },
                { value: "all", label: "All" },
              ]}
            />
          ) : (
            <span className="text-[12px] text-[var(--color-fg-muted)]">
              {channel.notify_resolved ? "On resolve" : "Open only"}
            </span>
          )}
        </div>

        <div className="text-[12px]">
          <DeliveryStatus channel={channel} />
        </div>

        <div className="flex flex-wrap items-center justify-start gap-1 lg:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!isOwner || pending}
            onClick={() =>
              test.mutate(channel.id, {
                onSuccess: () => toast.success("Test notification sent"),
                onError: (err) => toast.error((err as Error).message),
              })
            }
            aria-label={`Test channel ${channel.name}`}
          >
            {test.isPending ? <Spinner size={12} thickness={2} /> : <Send size={13} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-label={`${expanded ? "Hide" : "Show"} delivery history`}
          >
            <ChevronDown size={13} className={cn("transition-transform", expanded && "rotate-180")} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!isOwner || pending}
            onClick={onDelete}
            aria-label={`Delete channel ${channel.name}`}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Recent deliveries
          </div>
          {deliveries.isLoading ? (
            <div className="py-3 text-[11px] text-[var(--color-fg-muted)]">Loading…</div>
          ) : deliveries.data?.length ? (
            <div className="space-y-2">
              {deliveries.data.map((d) => (
                <div key={d.id} className="flex items-start justify-between gap-3 text-[11px]">
                  <div className="min-w-0">
                    <div className="truncate text-[var(--color-fg)]">
                      {d.notification_title ?? "Notification"}
                    </div>
                    {d.error_message && (
                      <div className="mt-0.5 text-[var(--color-err)]">{d.error_message}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={cn(
                        "font-medium uppercase tracking-[0.06em]",
                        d.status === "ok"
                          ? "text-[var(--color-ok)]"
                          : d.status === "failed"
                            ? "text-[var(--color-err)]"
                            : "text-[var(--color-fg-dim)]",
                      )}
                    >
                      {d.status}
                    </div>
                    <div className="mt-0.5 text-[var(--color-fg-dim)] tabular">
                      {lastSeen(d.sent_at ?? d.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-3 text-[11px] text-[var(--color-fg-muted)]">No deliveries yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryStatus({ channel }: { channel: NotificationChannel }) {
  if (!channel.last_delivery_status) {
    return <span className="text-[var(--color-fg-dim)]">Never</span>;
  }
  const ok = channel.last_delivery_status === "ok";
  return (
    <div>
      <div
        className={cn(
          "font-medium",
          ok ? "text-[var(--color-ok)]" : "text-[var(--color-err)]",
        )}
      >
        {ok ? "Delivered" : "Failed"}
      </div>
      {channel.last_delivery_at && (
        <div className="mt-0.5 text-[10px] text-[var(--color-fg-dim)] tabular">
          {lastSeen(channel.last_delivery_at)}
        </div>
      )}
      {!ok && channel.last_delivery_error && (
        <div className="mt-0.5 line-clamp-1 text-[10px] text-[var(--color-err)]">
          {channel.last_delivery_error}
        </div>
      )}
    </div>
  );
}

function NotificationFeedItem({ wid, notification }: { wid: string; notification: Notification }) {
  const { color, Icon, label } = notificationVisual(notification.kind);

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
          style={{
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            color,
          }}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-[var(--color-fg)]">{notification.title}</div>
              {notification.monitor_name && (
                <div className="mt-0.5 truncate text-[11px] text-[var(--color-fg-muted)]">
                  {notification.monitor_id ? (
                    <Link
                      to="/$wid/monitors/$mid"
                      params={{ wid, mid: notification.monitor_id }}
                      className="no-underline hover:text-[var(--color-link)]"
                    >
                      {notification.monitor_name}
                    </Link>
                  ) : (
                    notification.monitor_name
                  )}
                </div>
              )}
            </div>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)] tabular">
              {lastSeen(notification.created_at)}
            </span>
          </div>
          <div className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
            {notification.body}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]"
              style={{
                color,
                background: `color-mix(in srgb, ${color} 10%, transparent)`,
              }}
            >
              {label}
            </span>
            {notification.incident_id && (
              <Link
                to="/$wid/incidents"
                params={{ wid }}
                className="text-[11px] text-[var(--color-link)] no-underline hover:underline"
              >
                View incidents
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function notificationVisual(kind: Notification["kind"]) {
  if (kind === "incident_resolved") {
    return {
      color: "var(--color-ok)",
      Icon: CheckCircle2,
      label: "Resolved",
    };
  }
  if (kind === "incident_opened") {
    return {
      color: "var(--color-err)",
      Icon: AlertTriangle,
      label: "Opened",
    };
  }
  return {
    color: "var(--color-unknown)",
    Icon: BellRing,
    label: "Event",
  };
}

function AddChannelDialog({
  wid,
  open,
  onOpenChange,
}: {
  wid: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateNotificationChannel(wid);
  const [name, setName] = useState(DEFAULT_CHANNEL_NAME);
  const [kind, setKind] = useState<ChannelKind>("webhook");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>("all");

  function resetForm() {
    setName(DEFAULT_CHANNEL_NAME);
    setKind("webhook");
    setWebhookUrl("");
    setRecoveryMode("all");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        name,
        kind,
        webhook_url: webhookUrl,
        enabled: true,
        notify_resolved: recoveryMode === "all",
      },
      {
        onSuccess: () => {
          toast.success("Notification channel added");
          resetForm();
          onOpenChange(false);
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && create.isPending) return;
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Add notification channel"
        description="Receive incident open and recovery events on a webhook, Slack, or Discord URL."
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={create.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form="add-notification-channel"
              variant="primary"
              size="sm"
              disabled={create.isPending}
            >
              {create.isPending && <Spinner size={12} thickness={2} />}
              Add channel
            </Button>
          </>
        }
      >
        <form id="add-notification-channel" onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-[var(--color-fg-muted)]">
              Channel type
            </div>
            <Segmented<ChannelKind>
              value={kind}
              onChange={setKind}
              options={(Object.keys(KIND_META) as ChannelKind[]).map((k) => ({
                value: k,
                label: KIND_META[k].label,
                icon: KIND_META[k].icon,
              }))}
            />
          </div>

          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Webhook URL"
            type="url"
            placeholder={KIND_META[kind].placeholder}
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            hint={KIND_META[kind].hint}
            required
          />

          <div>
            <div className="mb-1.5 text-[12px] font-medium text-[var(--color-fg-muted)]">
              Recovery alerts
            </div>
            <Segmented<RecoveryMode>
              value={recoveryMode}
              onChange={setRecoveryMode}
              options={[
                { value: "open", label: "Open only" },
                { value: "all", label: "Open + recovery" },
              ]}
            />
            <p className="mt-2 text-[12px] text-[var(--color-fg-dim)]">
              {recoveryMode === "all"
                ? "Notify when incidents open and when monitors recover."
                : "Notify only when incidents open."}
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex h-24 items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
      <Spinner size={14} /> <span className="ml-2">{label}</span>
    </div>
  );
}
