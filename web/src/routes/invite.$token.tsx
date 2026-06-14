import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Check, Mail, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { Spinner } from "../components/Spinner";
import { auth } from "../lib/api";
import { authRedirectTarget } from "../lib/redirect";
import {
  invitePreviewQuery,
  meQuery,
  useAcceptInvite,
  useInvitePreview,
  workspacesQuery,
} from "../lib/queries";

export const Route = createFileRoute("/invite/$token")({
  beforeLoad: async ({ context, location }) => {
    if (!auth.token) {
      throw redirect({
        to: "/login",
        search: { redirect: authRedirectTarget(location) },
      });
    }
    try {
      await context.queryClient.ensureQueryData(meQuery);
    } catch {
      auth.clear();
      throw redirect({
        to: "/login",
        search: { redirect: authRedirectTarget(location) },
      });
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(invitePreviewQuery(params.token)),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);

  async function acceptInvite() {
    if (!preview.data) return;
    try {
      await accept.mutateAsync();
      toast.success("Invite accepted");
      const workspaces = await queryClient.fetchQuery(workspacesQuery);
      const workspace = workspaces.find((item) => item.id === preview.data?.workspace_id);
      await navigate({
        to: "/$wid",
        params: { wid: workspace?.slug ?? preview.data.workspace_id },
        replace: true,
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6">
      <div className="fade-in w-full max-w-[420px] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-6 shadow-[var(--shadow-pop)]">
        <div className="mb-5 flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full pulse-dot"
            style={{
              background: "var(--color-accent)",
              boxShadow: "0 0 12px color-mix(in srgb, var(--color-accent) 60%, transparent)",
            }}
          />
          <span className="text-[14px] font-semibold tracking-tight text-[var(--color-fg)]">
            unstatus
          </span>
        </div>

        {preview.isLoading ? (
          <div className="flex h-32 items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
            <Spinner size={14} /> <span className="ml-2">Loading invite...</span>
          </div>
        ) : preview.error ? (
          <InviteState
            icon={<TriangleAlert size={18} />}
            title="Invite unavailable"
            description={(preview.error as Error).message}
          />
        ) : preview.data ? (
          <>
            <InviteState
              icon={<Mail size={18} />}
              title={`Join ${preview.data.workspace_name}`}
              description={`You were invited as ${preview.data.role}. This invite expires ${formatDate(preview.data.expires_at)}.`}
            />
            <div className="mt-5 flex items-center justify-between gap-3">
              <Link to="/" className="link text-[13px]">
                Not now
              </Link>
              <Button variant="primary" onClick={acceptInvite} disabled={accept.isPending}>
                {accept.isPending && <Spinner size={12} thickness={2} />}
                <Check size={13} /> Accept invite
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function InviteState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
        {icon}
      </div>
      <h1 className="text-[20px] font-medium tracking-tight text-[var(--color-fg)]">{title}</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{description}</p>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}
