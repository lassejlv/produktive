import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import {
  useCreateSandboxApiToken,
  useRevokeSandboxApiToken,
  useSandboxApiTokens,
} from "#/lib/queries";
import { lastSeen } from "#/lib/status";
import { toast } from "#/lib/toast";

export function SandboxApiTokensSheet({ wid, open }: { wid: string; open: boolean }) {
  const tokens = useSandboxApiTokens(wid, open);
  const create = useCreateSandboxApiToken(wid);
  const revoke = useRevokeSandboxApiToken(wid);
  const [name, setName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (result) => {
          toast.success("API token created");
          setCreatedToken(result.token);
          setName("");
        },
        onError: (error) => toast.error((error as Error).message),
      },
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Sandbox API tokens</SheetTitle>
        <SheetDescription>
          Authenticate to{" "}
          <code className="mono text-[12px] text-[var(--color-fg-muted)]">/api/v1/sandboxes</code>{" "}
          with{" "}
          <code className="mono text-[12px] text-[var(--color-fg-muted)]">
            Authorization: Bearer prd_sbx_…
          </code>
          .
        </SheetDescription>
      </SheetHeader>
      <SheetPanel>
        <form onSubmit={submit} className="flex gap-2">
          <Input
            aria-label="Token name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="ci agent"
          />
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={create.isPending || !name.trim()}
          >
            {create.isPending && <Spinner className="size-3" />}
            Create
          </Button>
        </form>

        {createdToken && (
          <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-bg-row)] p-3">
            <div className="text-[11px] text-[var(--color-fg-dim)]">
              Copy this token now — it will not be shown again.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="mono min-w-0 flex-1 truncate text-[12px] text-[var(--color-fg)]">
                {createdToken}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  void navigator.clipboard.writeText(createdToken);
                  toast.success("Token copied");
                }}
              >
                <Copy size={12} /> Copy
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {tokens.isLoading ? (
            <div className="space-y-2 px-3 py-3">
              <Skeleton className="h-10 rounded-[var(--radius-md)]" />
              <Skeleton className="h-10 rounded-[var(--radius-md)]" />
            </div>
          ) : tokens.data?.length ? (
            tokens.data.map((token) => (
              <div key={token.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">
                    {token.name}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--color-fg-muted)]">
                    <span className="mono">{token.token_prefix}…</span>
                    <span>
                      {token.last_used_at ? `used ${lastSeen(token.last_used_at)}` : "never used"}
                    </span>
                    {token.revoked_at && <span>revoked {lastSeen(token.revoked_at)}</span>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={revoke.isPending || !!token.revoked_at}
                  onClick={() =>
                    revoke.mutate(token.id, {
                      onSuccess: () => toast.success("Token revoked"),
                      onError: (error) => toast.error((error as Error).message),
                    })
                  }
                  aria-label={`Revoke token ${token.name}`}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-[13px] text-[var(--color-fg-muted)]">
              No API tokens yet.
            </p>
          )}
        </div>
      </SheetPanel>
    </>
  );
}

export function SandboxApiTokensButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <KeyRound size={14} />
      API tokens
    </Button>
  );
}
