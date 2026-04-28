import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BillingSettings } from "@/components/workspace/billing-settings";
import { LoadingTip } from "@/components/ui/loading-tip";
import { useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/workspace/settings")({
  component: WorkspaceSettingsPage,
});

function WorkspaceSettingsPage() {
  const session = useSession();
  const navigate = useNavigate();
  const organization = session.data?.organization;

  return (
    <div className="mx-auto w-full max-w-[880px] px-6 py-10">
      <header className="mb-10">
        <button
          type="button"
          onClick={() => void navigate({ to: "/issues" })}
          className="mb-5 inline-flex items-center text-[12px] text-fg-muted transition-colors hover:text-fg"
        >
          Back
        </button>
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
          Workspace / Settings
        </div>
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em] text-fg">
          Workspace settings
        </h1>
        <p className="mt-2 max-w-[520px] text-[13px] leading-6 text-fg-muted">
          Configure workspace-level details and billing for{" "}
          <span className="text-fg">
            {organization?.name ?? "this workspace"}
          </span>
          .
        </p>
      </header>

      <SettingsSection
        title="Workspace"
        description="Identity and workspace-scoped configuration."
      >
        {!organization ? (
          <LoadingTip compact />
        ) : (
          <div className="border-t border-border-subtle">
            <DetailRow label="Name">{organization.name}</DetailRow>
            <DetailRow label="Slug">
              <span className="font-mono text-[12px]">{organization.slug}</span>
            </DetailRow>
            <DetailRow label="Scope">
              Settings here apply to the active workspace.
            </DetailRow>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Billing"
        description="Subscription state, customer record, and owner-only actions."
      >
        <BillingSettings />
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-border-subtle py-7 md:grid-cols-[180px_minmax(0,1fr)]">
      <div>
        <h2 className="m-0 text-[13px] font-medium text-fg">{title}</h2>
        {description ? (
          <p className="m-0 mt-1 max-w-[180px] text-[12px] leading-5 text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-border-subtle py-3 text-[13px] md:grid-cols-[140px_minmax(0,1fr)]">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-faint">
        {label}
      </div>
      <div className="min-w-0 text-fg">{children}</div>
    </div>
  );
}
