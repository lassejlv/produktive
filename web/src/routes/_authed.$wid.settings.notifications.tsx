import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  BellRing,
  Hash,
  type LucideIcon,
  MessagesSquare,
  Trash2,
  Webhook,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { Segmented } from "../components/Segmented";
import { Spinner } from "../components/Spinner";
import {
  notificationChannelsQuery,
  notificationsQuery,
  useCreateNotificationChannel,
  useDeleteNotificationChannel,
  useNotificationChannels,
  useNotifications,
} from "../lib/queries";
import { lastSeen } from "../lib/status";
import type { NotificationChannel } from "../lib/types";

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
  const channels = useNotificationChannels(wid);
  const notifications = useNotifications(wid);
  const create = useCreateNotificationChannel(wid);
  const remove = useDeleteNotificationChannel(wid);
  const [name, setName] = useState("Incident alerts");
  const [kind, setKind] = useState<ChannelKind>("webhook");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [notifyResolved, setNotifyResolved] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<NotificationChannel | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        name,
        kind,
        webhook_url: webhookUrl,
        enabled: true,
        notify_resolved: notifyResolved,
      },
      {
        onSuccess: () => {
          toast.success("Notification channel added");
          setWebhookUrl("");
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bell size={15} className="text-[var(--color-accent)]" />
            <h3 className="text-[15px] font-medium text-[var(--color-fg)]">
              Notification channels
            </h3>
          </div>

          <form
            onSubmit={submit}
            className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 shadow-[var(--shadow-sm)] mb-4"
          >
            <div className="mb-3">
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
            <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-3">
              <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input
                label="Webhook URL"
                type="url"
                placeholder={KIND_META[kind].placeholder}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                required
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-fg-dim)]">{KIND_META[kind].hint}</p>
            <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
              <input
                type="checkbox"
                checked={notifyResolved}
                onChange={(e) => setNotifyResolved(e.target.checked)}
              />
              Send recovery notifications
            </label>
            <div className="mt-4">
              <Button type="submit" variant="primary" disabled={create.isPending}>
                {create.isPending && <Spinner size={12} thickness={2} />}
                Add channel
              </Button>
            </div>
          </form>

          {channels.isLoading ? (
            <LoadingLine label="loading channels..." />
          ) : channels.data?.length ? (
            <div className="space-y-2">
              {channels.data.map((channel) => {
                const meta = channelMeta(channel.kind);
                const Icon = meta.icon;
                return (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]"
                        title={meta.label}
                      >
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[var(--color-fg)]">
                            {channel.name}
                          </span>
                          <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-muted)] bg-[var(--color-bg-row)]">
                            {channel.enabled ? "active" : "paused"}
                          </span>
                        </div>
                        <div className="mt-1 text-[12px] text-[var(--color-fg-muted)] mono truncate">
                          {channel.masked_url}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(channel)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Bell}
              title="No notification channels"
              description="Add a webhook, Slack, or Discord channel to receive incident open and recovery events."
            />
          )}
        </section>

        <aside>
          <div className="flex items-center gap-2 mb-4">
            <BellRing size={15} className="text-[var(--color-accent)]" />
            <h3 className="text-[15px] font-medium text-[var(--color-fg)]">Recent notifications</h3>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)] overflow-hidden">
            {notifications.isLoading ? (
              <LoadingLine label="loading notifications..." />
            ) : notifications.data?.length ? (
              notifications.data.slice(0, 8).map((n) => (
                <div
                  key={n.id}
                  className="border-b last:border-b-0 border-[var(--color-border)] px-4 py-3"
                >
                  <div className="text-[12px] font-medium text-[var(--color-fg)]">{n.title}</div>
                  <div className="mt-1 text-[11px] text-[var(--color-fg-muted)] line-clamp-2">
                    {n.body}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
                    {lastSeen(n.created_at)}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-[12px] text-[var(--color-fg-muted)]">
                No notifications yet.
              </div>
            )}
          </div>
        </aside>
      </div>

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

function LoadingLine({ label }: { label: string }) {
  return (
    <div className="h-24 flex items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
      <Spinner size={14} /> <span className="ml-2">{label}</span>
    </div>
  );
}
