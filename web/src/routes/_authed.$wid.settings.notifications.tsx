import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Plus, Send, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { Input } from "../components/Input";
import { Segmented } from "../components/Segmented";
import { Spinner } from "#/components/ui/spinner";
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

const RECENT_LIMIT = 12;
const DEFAULT_CHANNEL_NAME = "Incident alerts";

export const Route = createFileRoute("/_authed/$wid/settings/notifications")({
  staticData: {
    title: "Settings",
    description: "Webhook, Slack, and Discord alerts for incidents.",
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

const KIND_LABEL: Record<ChannelKind, string> = {
  webhook: "Webhook",
  slack: "Slack",
  discord: "Discord",
};

const KIND_PLACEHOLDER: Record<ChannelKind, string> = {
  webhook: "https://hooks.example.com/incidents",
  slack: "https://hooks.slack.com/services/T000/B000/XXXXXXXX",
  discord: "https://discord.com/api/webhooks/000000/XXXXXXXX",
};

function kindLabel(kind: NotificationChannel["kind"]) {
  return kind === "unknown" ? "Webhook" : KIND_LABEL[kind];
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

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Channels
          </h3>
          {isOwner && channelList.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={12} /> Add channel
            </Button>
          )}
        </div>

        {!isOwner && (
          <p className="mb-3 text-[12px] text-[var(--color-fg-dim)]">
            Only the workspace owner can manage notification channels.
          </p>
        )}

        {channels.isLoading ? (
          <LoadingLine label="Loading channels…" />
        ) : channelList.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-4 py-5 text-center">
            <p className="text-[13px] text-[var(--color-fg-muted)]">No channels yet</p>
            {isOwner && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={13} /> Add channel
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
            {channelList.map((channel, index) => (
              <ChannelRow
                key={channel.id}
                wid={wid}
                channel={channel}
                isOwner={isOwner}
                onDelete={() => setDeleteTarget(channel)}
                className={index > 0 ? "border-t border-[var(--color-border)]" : undefined}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
          Recent activity
        </h3>

        {notifications.isLoading ? (
          <LoadingLine label="Loading activity…" />
        ) : recentNotifications.length === 0 ? (
          <p className="text-[13px] text-[var(--color-fg-muted)]">
            No notifications yet. Events appear when monitors open or resolve incidents.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
            {recentNotifications.map((notification, index) => (
              <NotificationRow
                key={notification.id}
                wid={wid}
                notification={notification}
                className={index > 0 ? "border-t border-[var(--color-border)]" : undefined}
              />
            ))}
          </div>
        )}
      </section>

      <AddChannelDialog wid={wid} open={createOpen} onOpenChange={setCreateOpen} />

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
    </div>
  );
}

function ChannelRow({
  wid,
  channel,
  isOwner,
  onDelete,
  className,
}: {
  wid: string;
  channel: NotificationChannel;
  isOwner: boolean;
  onDelete: () => void;
  className?: string;
}) {
  const update = useUpdateNotificationChannel(wid);
  const test = useTestNotificationChannel(wid);
  const [expanded, setExpanded] = useState(false);
  const deliveries = useNotificationDeliveries(wid, expanded ? channel.id : null);
  const pending = update.isPending || test.isPending;

  function patch(body: { enabled?: boolean; notify_resolved?: boolean }) {
    update.mutate(
      { id: channel.id, ...body },
      { onError: (err) => toast.error((err as Error).message) },
    );
  }

  return (
    <div className={cn("px-4 py-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--color-fg)]">{channel.name}</p>
          <p className="mono mt-0.5 truncate text-[11px] text-[var(--color-fg-dim)]">
            {channel.masked_url}
          </p>
          <p className="mt-1.5 text-[11px] text-[var(--color-fg-dim)]">
            {kindLabel(channel.kind)}
            {" · "}
            {channel.enabled ? "On" : "Off"}
            {" · "}
            {channel.notify_resolved ? "Open + recovery" : "Open only"}
            {" · "}
            <DeliveryLabel channel={channel} />
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={!isOwner || pending}
            onClick={() =>
              test.mutate(channel.id, {
                onSuccess: () => toast.success("Test notification sent"),
                onError: (err) => toast.error((err as Error).message),
              })
            }
            aria-label={`Test channel ${channel.name}`}
          >
            {test.isPending ? <Spinner className="size-3" /> : <Send size={12} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setExpanded((value) => !value)}
            aria-label={`${expanded ? "Hide" : "Show"} delivery history`}
          >
            <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={!isOwner || pending}
            onClick={onDelete}
            aria-label={`Delete channel ${channel.name}`}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>

      {isOwner && (
        <div className="mt-2.5 flex flex-wrap items-center gap-4">
          <Field label="Active">
            <Toggle
              value={channel.enabled}
              onChange={(enabled) => patch({ enabled })}
              disabled={pending}
            />
          </Field>
          <Field label="Recovery alerts">
            <select
              value={channel.notify_resolved ? "all" : "open"}
              disabled={pending}
              onChange={(event) => patch({ notify_resolved: event.target.value === "all" })}
              className={fieldClass}
            >
              <option value="open">Open only</option>
              <option value="all">Open + recovery</option>
            </select>
          </Field>
        </div>
      )}

      {expanded && (
        <div className="mt-2.5 space-y-2 border-t border-[var(--color-border)] pt-2.5">
          {deliveries.isLoading ? (
            <p className="text-[12px] text-[var(--color-fg-muted)]">Loading deliveries…</p>
          ) : deliveries.data?.length ? (
            deliveries.data.map((delivery) => (
              <div
                key={delivery.id}
                className="flex items-start justify-between gap-3 text-[12px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[var(--color-fg)]">
                    {delivery.notification_title ?? "Notification"}
                  </p>
                  {delivery.error_message && (
                    <p className="mt-0.5 text-[var(--color-err)]">{delivery.error_message}</p>
                  )}
                </div>
                <div className="shrink-0 text-right text-[var(--color-fg-dim)]">
                  <p
                    className={cn(
                      delivery.status === "ok" && "text-[var(--color-ok)]",
                      delivery.status === "failed" && "text-[var(--color-err)]",
                    )}
                  >
                    {delivery.status}
                  </p>
                  <p className="tabular">{lastSeen(delivery.sent_at ?? delivery.created_at)}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-[12px] text-[var(--color-fg-muted)]">No deliveries yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryLabel({ channel }: { channel: NotificationChannel }) {
  if (!channel.last_delivery_status) return <>Never delivered</>;
  const ok = channel.last_delivery_status === "ok";
  return (
    <>
      {ok ? "Delivered" : "Failed"}
      {channel.last_delivery_at && <> {lastSeen(channel.last_delivery_at)}</>}
    </>
  );
}

function NotificationRow({
  wid,
  notification,
  className,
}: {
  wid: string;
  notification: Notification;
  className?: string;
}) {
  const kind =
    notification.kind === "incident_resolved"
      ? "Resolved"
      : notification.kind === "incident_opened"
        ? "Opened"
        : "Event";

  return (
    <div className={cn("px-4 py-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-[var(--color-fg)]">{notification.title}</p>
          {notification.monitor_name && (
            <p className="mt-0.5 truncate text-[12px] text-[var(--color-fg-muted)]">
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
            </p>
          )}
        </div>
        <span className="shrink-0 text-[11px] tabular text-[var(--color-fg-dim)]">
          {lastSeen(notification.created_at)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
        {notification.body}
      </p>
      <p className="mt-1.5 text-[11px] text-[var(--color-fg-dim)]">
        {kind}
        {notification.incident_id && (
          <>
            {" · "}
            <Link
              to="/$wid/incidents"
              params={{ wid }}
              className="text-[var(--color-link)] no-underline hover:underline"
            >
              Incidents
            </Link>
          </>
        )}
      </p>
    </div>
  );
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

  function submit(event: FormEvent) {
    event.preventDefault();
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
        title="Add channel"
        description="Webhook, Slack, or Discord URL for incident alerts."
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
              variant="default"
              size="sm"
              disabled={create.isPending}
            >
              {create.isPending && <Spinner className="size-3" />}
              Add channel
            </Button>
          </>
        }
      >
        <form id="add-notification-channel" onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Type">
            <Segmented<ChannelKind>
              value={kind}
              onChange={setKind}
              size="sm"
              options={(Object.keys(KIND_LABEL) as ChannelKind[]).map((value) => ({
                value,
                label: KIND_LABEL[value],
              }))}
            />
          </Field>

          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} required />

          <Input
            label="Webhook URL"
            type="url"
            placeholder={KIND_PLACEHOLDER[kind]}
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
            required
          />

          <Field label="Recovery alerts">
            <select
              value={recoveryMode}
              onChange={(event) => setRecoveryMode(event.target.value as RecoveryMode)}
              className={fieldClass}
            >
              <option value="open">Open only</option>
              <option value="all">Open + recovery</option>
            </select>
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-[var(--color-fg-muted)]">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full border transition-colors disabled:opacity-50",
        value
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
          : "border-[var(--color-border-hi)] bg-[var(--color-bg-sunken)]",
      )}
      aria-pressed={value}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full transition-all",
          value ? "left-5 bg-[var(--color-bg-elev)]" : "left-0.5 bg-[var(--color-fg-dim)]",
        )}
      />
    </button>
  );
}

function LoadingLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
      <Spinner className="size-3.5" />
      {label}
    </div>
  );
}

const fieldClass = cn(
  "h-8 rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)]",
  "px-2.5 text-[12px] text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none",
  "focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);
