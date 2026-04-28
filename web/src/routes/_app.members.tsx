import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/issue/avatar";
import {
  type Invitation,
  type Member,
  createInvitation,
  listInvitations,
  listMembers,
  resendInvitation,
  revokeInvitation,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/members")({
  component: MembersPage,
});

function MembersPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    void Promise.all([listMembers(), listInvitations()])
      .then(([m, i]) => {
        if (!mounted) return;
        setMembers(m.members);
        setInvitations(i.invitations);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const onInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inviteSubmitting) return;
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteSubmitting(true);
    try {
      const invitation = await createInvitation(email);
      setInvitations((current) => [invitation, ...current]);
      setInviteEmail("");
      toast.success(`Invite sent to ${invitation.email}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send invite",
      );
    } finally {
      setInviteSubmitting(false);
    }
  };

  const onRevoke = async (invitationId: string) => {
    if (!window.confirm("Revoke this invitation?")) return;
    try {
      const response = await revokeInvitation(invitationId);
      setInvitations(response.invitations);
      toast.success("Invitation revoked");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to revoke",
      );
    }
  };

  const onResend = async (invitationId: string) => {
    try {
      const updated = await resendInvitation(invitationId);
      setInvitations((current) =>
        current.map((inv) => (inv.id === updated.id ? updated : inv)),
      );
      toast.success(`Invitation resent to ${updated.email}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to resend",
      );
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px] px-6 py-10">
      <header className="mb-8">
        <button
          type="button"
          onClick={() => void navigate({ to: "/issues" })}
          className="mb-4 inline-flex items-center gap-1 text-[12px] text-fg-muted transition-colors hover:text-fg"
        >
          ← Back
        </button>
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em] text-fg">
          Members
        </h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          Invite teammates and manage who has access to this workspace.
        </p>
      </header>

      <section className="mb-6 rounded-[10px] border border-border-subtle bg-surface/40 p-4">
        <h2 className="m-0 text-[13px] font-medium text-fg">Invite a teammate</h2>
        <form onSubmit={onInvite} className="mt-3 flex gap-2">
          <input
            type="email"
            required
            placeholder="alice@example.com"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            disabled={inviteSubmitting}
            className="h-9 flex-1 rounded-md border border-border bg-bg px-3 text-[13px] text-fg outline-none placeholder:text-fg-faint focus:border-accent disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!inviteEmail.trim() || inviteSubmitting}
            className="inline-flex h-9 items-center rounded-md bg-fg px-4 text-[13px] font-medium text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inviteSubmitting ? "Sending…" : "Send invite"}
          </button>
        </form>
      </section>

      {invitations.length > 0 ? (
        <section className="mb-6 rounded-[10px] border border-border-subtle bg-surface/40 p-4">
          <h2 className="m-0 mb-3 text-[13px] font-medium text-fg">
            Pending invitations
            <span className="ml-2 text-[11px] tabular-nums text-fg-faint">
              {invitations.length}
            </span>
          </h2>
          <ul className="overflow-hidden rounded-md border border-border-subtle">
            {invitations.map((invitation, index) => (
              <li
                key={invitation.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-[13px]",
                  index !== invitations.length - 1 &&
                    "border-b border-border-subtle",
                )}
              >
                <span className="grid size-6 place-items-center rounded-full border border-dashed border-border text-[10px] text-fg-faint">
                  ?
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-fg">{invitation.email}</div>
                  <div className="truncate text-[11px] text-fg-faint">
                    Invited {formatRelative(invitation.createdAt)}
                    {invitation.invitedByName ? (
                      <> by {invitation.invitedByName}</>
                    ) : null}{" "}
                    · expires {formatRelative(invitation.expiresAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onResend(invitation.id)}
                  className="rounded-md border border-border-subtle bg-bg px-2 py-1 text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => void onRevoke(invitation.id)}
                  className="rounded-md px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-[10px] border border-border-subtle bg-surface/40 p-4">
        <h2 className="m-0 mb-3 text-[13px] font-medium text-fg">
          Members
          <span className="ml-2 text-[11px] tabular-nums text-fg-faint">
            {members.length}
          </span>
        </h2>
        {loading ? (
          <p className="text-[12px] text-fg-faint">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-[12px] text-fg-faint">No members yet.</p>
        ) : (
          <ul className="overflow-hidden rounded-md border border-border-subtle">
            {members.map((member, index) => (
              <li
                key={member.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-[13px]",
                  index !== members.length - 1 &&
                    "border-b border-border-subtle",
                )}
              >
                <Avatar name={member.name} image={member.image} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-fg">{member.name}</div>
                  <div className="truncate text-[11px] text-fg-muted">
                    {member.email}
                  </div>
                </div>
                {member.role === "owner" ? (
                  <span className="rounded-full border border-border-subtle bg-bg px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                    Owner
                  </span>
                ) : (
                  <span className="text-[11px] text-fg-faint">Member</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatRelative(value: string) {
  const then = new Date(value).getTime();
  const diffMs = then - Date.now();
  const absMin = Math.abs(Math.floor(diffMs / 60_000));
  const future = diffMs > 0;
  if (absMin < 1) return "just now";
  if (absMin < 60) return future ? `in ${absMin}m` : `${absMin}m ago`;
  const hours = Math.floor(absMin / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  return new Date(value).toLocaleDateString();
}
