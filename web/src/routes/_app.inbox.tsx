import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useInbox } from "@/lib/use-inbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markRead, markAll } =
    useInbox();

  const open = async (
    id: string,
    targetType: string,
    targetId: string,
    isRead: boolean,
  ) => {
    if (!isRead) {
      void markRead(id);
    }
    if (targetType === "issue") {
      await navigate({
        to: "/issues/$issueId",
        params: { issueId: targetId },
      });
    }
  };

  return (
    <main className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-fg">Inbox</h1>
          <span className="text-xs text-fg-muted tabular-nums">
            {notifications.length}
          </span>
        </div>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void markAll()}
            className="text-[12px] text-fg-muted transition-colors hover:text-fg"
          >
            Mark all as read
          </button>
        ) : null}
      </header>
      <section className="mx-auto w-full max-w-[760px] px-6 py-8">
        {isLoading ? (
          <p className="text-[13px] text-fg-faint">Loading…</p>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-[13px] text-fg">You're all caught up.</p>
            <p className="mt-1 text-[12px] text-fg-muted">
              New comments and assignments will land here.
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border-subtle">
            {notifications.map((notification, index) => {
              const isUnread = notification.readAt === null;
              return (
                <li
                  key={notification.id}
                  className={cn(
                    "border-border-subtle",
                    index !== notifications.length - 1 && "border-b",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      void open(
                        notification.id,
                        notification.targetType,
                        notification.targetId,
                        !isUnread,
                      )
                    }
                    className={cn(
                      "group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/40",
                      isUnread && "bg-surface/20",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full transition-colors",
                        isUnread ? "bg-accent" : "bg-transparent",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            isUnread ? "text-fg" : "text-fg-muted",
                          )}
                        >
                          {notification.title}
                        </span>
                      </div>
                      {notification.snippet ? (
                        <p className="mt-0.5 truncate text-[12px] text-fg-faint">
                          {notification.snippet}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-fg-faint">
                        {formatRelative(notification.createdAt)}
                        {notification.actor ? (
                          <>
                            {" · "}
                            {notification.actor.name}
                          </>
                        ) : null}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function formatRelative(value: string) {
  const then = new Date(value).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}
