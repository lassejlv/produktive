import { ApiError } from "../../lib/api";

export function PublicStatusError({
  error,
  notFoundMessage = "The page you requested doesn't exist or is disabled.",
}: {
  error: unknown | null;
  notFoundMessage?: string;
}) {
  const isNotFound = error === null || (error instanceof ApiError && error.status === 404);
  const title = isNotFound ? "Status page not found" : "Could not load status page";
  const message = isNotFound
    ? notFoundMessage
    : error instanceof Error
      ? error.message
      : "Something went wrong. Try again in a moment.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
      <div className="max-w-sm px-6 text-center">
        <div className="mb-1.5 text-[15px] font-medium tracking-tight text-[var(--color-fg)]">
          {title}
        </div>
        <div className="text-[13px] text-[var(--color-fg-muted)]">{message}</div>
      </div>
    </div>
  );
}
