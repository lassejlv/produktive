import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Copy, LayoutGrid, Settings, Terminal as TerminalIcon, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Segmented } from "#/components/Segmented";
import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/cn";
import { formatDeployRegion } from "#/lib/deploy-regions";
import {
  useCreateDeploySandboxCheckpoint,
  useDeleteDeploySandbox,
  useDeleteDeploySandboxCheckpoint,
  useDeployRegions,
  useDeploySandboxCheckpoints,
  useExecDeploySandbox,
  useRestoreDeploySandboxCheckpoint,
  useUpdateDeploySandbox,
} from "#/lib/queries";
import {
  DEFAULT_SANDBOX_DETAIL_TAB,
  SANDBOX_STATUS_COLOR,
  SANDBOX_STATUS_LABEL,
  sandboxStatusActive,
  type SandboxDetailTab,
} from "#/lib/sandboxes";
import { toast } from "#/lib/toast";
import type { DeploySandbox } from "#/lib/types";
import { fieldControlClass } from "#/components/deployments/deploy-shared";

export function SandboxDetail({
  wid,
  sandbox,
  tab,
  onTabChange,
  onDeleted,
}: {
  wid: string;
  sandbox: DeploySandbox;
  tab: SandboxDetailTab;
  onTabChange: (tab: SandboxDetailTab) => void;
  onDeleted?: () => void;
}) {
  const { data: regions } = useDeployRegions(wid);
  const color = SANDBOX_STATUS_COLOR[sandbox.status] ?? SANDBOX_STATUS_COLOR.unknown;
  const active = sandboxStatusActive(sandbox.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-bg-elev)]">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn("inline-block h-2 w-2 shrink-0 rounded-full", active && "pulse-dot")}
                style={{
                  background: color,
                  boxShadow: active
                    ? `0 0 8px color-mix(in srgb, ${color} 50%, transparent)`
                    : undefined,
                }}
              />
              <h2 className="truncate text-[15px] font-medium tracking-tight text-[var(--color-fg)]">
                {sandbox.name}
              </h2>
              <span
                className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{ color }}
              >
                {SANDBOX_STATUS_LABEL[sandbox.status] ?? sandbox.status}
              </span>
            </div>
            <p className="mono mt-1 truncate text-[11px] text-[var(--color-fg-muted)]">
              {sandbox.provider_name}
            </p>
            <p className="mt-1.5 text-[11px] text-[var(--color-fg-dim)]">
              {formatDeployRegion(sandbox.region, regions)}
              <span className="mx-1.5 text-[var(--color-border-hi)]">·</span>
              {sandbox.cpus} CPU
              <span className="mx-1.5 text-[var(--color-border-hi)]">·</span>
              {sandbox.ram_mb} MB RAM
              <span className="mx-1.5 text-[var(--color-border-hi)]">·</span>
              {sandbox.storage_gb} GB
            </p>
          </div>
        </div>
        <div className="mt-3">
          <Segmented
            value={tab}
            onChange={onTabChange}
            options={[
              { value: "overview", label: "Overview", icon: LayoutGrid },
              { value: "exec", label: "Exec", icon: TerminalIcon },
              { value: "checkpoints", label: "Checkpoints", icon: Copy },
              { value: "settings", label: "Settings", icon: Settings },
            ]}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "overview" && <OverviewPanel sandbox={sandbox} />}
        {tab === "exec" && <ExecPanel wid={wid} sandbox={sandbox} />}
        {tab === "checkpoints" && <CheckpointsPanel wid={wid} sandbox={sandbox} />}
        {tab === "settings" && <SettingsPanel wid={wid} sandbox={sandbox} onDeleted={onDeleted} />}
      </div>
    </div>
  );
}

function OverviewPanel({ sandbox }: { sandbox: DeploySandbox }) {
  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-4">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--color-fg-muted)]">
          Metadata
        </h3>
        <dl className="mt-3 space-y-2 text-[12px]">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-fg-dim)]">Slug</dt>
            <dd className="mono text-[var(--color-fg)]">{sandbox.slug}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-fg-dim)]">Created</dt>
            <dd className="text-[var(--color-fg)]">
              {new Date(sandbox.created_at).toLocaleString()}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-fg-dim)]">Updated</dt>
            <dd className="text-[var(--color-fg)]">
              {new Date(sandbox.updated_at).toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function ExecPanel({ wid, sandbox }: { wid: string; sandbox: DeploySandbox }) {
  const exec = useExecDeploySandbox(wid);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const inputRef = useRef("");
  const cwdRef = useRef("/");
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const execMutateRef = useRef(exec.mutate);

  useEffect(() => {
    execMutateRef.current = exec.mutate;
  }, [exec.mutate]);

  const write = useCallback((value: string) => {
    termRef.current?.write(value.replace(/\n/g, "\r\n"));
  }, []);

  const prompt = useCallback(() => {
    termRef.current?.write(`\r\n\x1b[32m${sandbox.slug}\x1b[0m:\x1b[34m${cwdRef.current}\x1b[0m$ `);
  }, [sandbox.slug]);

  const rewriteInput = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.write(
      `\r\x1b[2K\x1b[32m${sandbox.slug}\x1b[0m:\x1b[34m${cwdRef.current}\x1b[0m$ ${inputRef.current}`,
    );
  }, [sandbox.slug]);

  const runCommand = useCallback(
    (raw: string) => {
      const line = raw.trim();
      if (!line) {
        prompt();
        return;
      }

      historyRef.current = [...historyRef.current.filter((item) => item !== line), line].slice(
        -100,
      );
      historyIndexRef.current = null;

      if (line === "clear" || line === "cls") {
        termRef.current?.clear();
        prompt();
        return;
      }

      if (line === "pwd") {
        write(`${cwdRef.current}\n`);
        prompt();
        return;
      }

      if (line === "cd" || line.startsWith("cd ")) {
        const next = line.slice(2).trim() || "/";
        if (next.startsWith("/")) {
          cwdRef.current = next;
        } else if (next === "..") {
          cwdRef.current = cwdRef.current.split("/").filter(Boolean).slice(0, -1).join("/");
          cwdRef.current = cwdRef.current ? `/${cwdRef.current}` : "/";
        } else if (next !== ".") {
          cwdRef.current = `${cwdRef.current.replace(/\/$/, "")}/${next}`;
        }
        prompt();
        return;
      }

      pendingRef.current = true;
      termRef.current?.write("\r\n");
      execMutateRef.current(
        {
          sandboxId: sandbox.id,
          command: "sh",
          args: ["-lc", line],
          cwd: cwdRef.current,
        },
        {
          onSuccess: (data) => {
            if (data.stdout) write(data.stdout);
            if (data.stderr) write(`\x1b[31m${data.stderr}\x1b[0m`);
            if (data.timed_out) write("\x1b[33mcommand timed out\x1b[0m\n");
            if (data.truncated) write("\x1b[33moutput truncated\x1b[0m\n");
            if (data.exit_code !== 0) write(`\x1b[90mexit ${data.exit_code}\x1b[0m\n`);
          },
          onError: (error) => {
            write(`\x1b[31m${(error as Error).message}\x1b[0m\n`);
            toast.error((error as Error).message);
          },
          onSettled: () => {
            pendingRef.current = false;
            prompt();
          },
        },
      );
    },
    [prompt, sandbox.id, write],
  );

  useEffect(() => {
    if (!mountRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily:
        "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.45,
      theme: {
        background: "#050505",
        foreground: "#e8e8e8",
        cursor: "#ffffff",
        selectionBackground: "#3a3a3a",
        black: "#111111",
        red: "#ff6b6b",
        green: "#7bd88f",
        yellow: "#f7d774",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#d7d7d7",
        brightBlack: "#666666",
        brightRed: "#ff8f8f",
        brightGreen: "#a6e3a1",
        brightYellow: "#ffe58a",
        brightBlue: "#9dbbff",
        brightMagenta: "#d7b4ff",
        brightCyan: "#a5f3fc",
        brightWhite: "#ffffff",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(mountRef.current);
    termRef.current = term;
    fit.fit();
    term.focus();
    term.write(`\x1b[32m${sandbox.slug}\x1b[0m:\x1b[34m${cwdRef.current}\x1b[0m$ `);

    const resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(mountRef.current);

    const dataDisposable = term.onData((data) => {
      if (pendingRef.current) {
        if (data === "\u0003") term.write("^C\r\n\x1b[90mcommand is already running\x1b[0m");
        return;
      }

      if (data === "\r") {
        const current = inputRef.current;
        inputRef.current = "";
        runCommand(current);
        return;
      }
      if (data === "\u007f") {
        if (!inputRef.current) return;
        inputRef.current = inputRef.current.slice(0, -1);
        term.write("\b \b");
        return;
      }
      if (data === "\u0003") {
        inputRef.current = "";
        term.write("^C");
        prompt();
        return;
      }
      if (data === "\u000c") {
        term.clear();
        inputRef.current = "";
        term.write(`\x1b[32m${sandbox.slug}\x1b[0m:\x1b[34m${cwdRef.current}\x1b[0m$ `);
        return;
      }
      if (data === "\x1b[A" || data === "\x1b[B") {
        const history = historyRef.current;
        if (!history.length) return;
        const current = historyIndexRef.current;
        if (data === "\x1b[A") {
          historyIndexRef.current = current == null ? history.length - 1 : Math.max(0, current - 1);
        } else {
          historyIndexRef.current =
            current == null ? null : current >= history.length - 1 ? null : current + 1;
        }
        inputRef.current =
          historyIndexRef.current == null ? "" : (history[historyIndexRef.current] ?? "");
        rewriteInput();
        return;
      }
      if (data >= " " && data !== "\x7f") {
        inputRef.current += data;
        term.write(data);
      }
    });

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      inputRef.current = "";
      pendingRef.current = false;
    };
  }, [prompt, rewriteInput, runCommand, sandbox.slug]);

  return (
    <div className="flex min-h-[460px] flex-1 flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[#050505] shadow-[var(--shadow-xs)]">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="mono ml-2 truncate text-[11px] text-white/50">{sandbox.slug}</span>
      </div>
      <div ref={mountRef} className="min-h-0 flex-1 overflow-hidden p-3" />
    </div>
  );
}

function CheckpointsPanel({ wid, sandbox }: { wid: string; sandbox: DeploySandbox }) {
  const checkpoints = useDeploySandboxCheckpoints(wid, sandbox.id);
  const create = useCreateDeploySandboxCheckpoint(wid);
  const restore = useRestoreDeploySandboxCheckpoint(wid);
  const remove = useDeleteDeploySandboxCheckpoint(wid);
  const [comment, setComment] = useState("");

  const sorted = useMemo(
    () =>
      [...(checkpoints.data ?? [])].sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      ),
    [checkpoints.data],
  );

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(
            { sandboxId: sandbox.id, comment: comment.trim() || undefined },
            {
              onSuccess: () => {
                setComment("");
                toast.success("Checkpoint created");
              },
              onError: (error) => toast.error((error as Error).message),
            },
          );
        }}
      >
        <div className="min-w-[220px] flex-1">
          <label className="text-[12px] text-[var(--color-fg-muted)]">Comment</label>
          <Input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className={cn("mt-1.5", fieldControlClass)}
            placeholder="Before risky change"
          />
        </div>
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending && <Spinner className="size-3" />}
          Create checkpoint
        </Button>
      </form>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
        {checkpoints.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--color-fg-muted)]">
            No checkpoints yet.
          </p>
        ) : (
          sorted.map((checkpoint) => (
            <div
              key={checkpoint.id}
              className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="mono text-[13px] text-[var(--color-fg)]">{checkpoint.id}</p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--color-fg-muted)]">
                  {checkpoint.comment ?? "No comment"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={restore.isPending}
                  onClick={() =>
                    restore.mutate(
                      { sandboxId: sandbox.id, checkpointId: checkpoint.id },
                      {
                        onSuccess: () => toast.success("Checkpoint restored"),
                        onError: (error) => toast.error((error as Error).message),
                      },
                    )
                  }
                >
                  Restore
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(
                      { sandboxId: sandbox.id, checkpointId: checkpoint.id },
                      {
                        onSuccess: () => toast.success("Checkpoint deleted"),
                        onError: (error) => toast.error((error as Error).message),
                      },
                    )
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SettingsPanel({
  wid,
  sandbox,
  onDeleted,
}: {
  wid: string;
  sandbox: DeploySandbox;
  onDeleted?: () => void;
}) {
  const update = useUpdateDeploySandbox(wid);
  const remove = useDeleteDeploySandbox(wid);
  const [name, setName] = useState(sandbox.name);

  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate(
            { sandboxId: sandbox.id, name: name.trim() },
            {
              onSuccess: () => toast.success("Sandbox updated"),
              onError: (error) => toast.error((error as Error).message),
            },
          );
        }}
      >
        <div>
          <label className="text-[12px] text-[var(--color-fg-muted)]">Display name</label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={cn("mt-1.5", fieldControlClass)}
            required
          />
        </div>
        <Button type="submit" size="sm" disabled={update.isPending || !name.trim()}>
          {update.isPending && <Spinner className="size-3" />}
          Save changes
        </Button>
      </form>
      <section className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-err)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-err)_6%,transparent)] p-4">
        <h3 className="text-[13px] font-medium text-[var(--color-fg)]">Delete sandbox</h3>
        <p className="mt-1 text-[12px] leading-6 text-[var(--color-fg-muted)]">
          Permanently destroys the sandbox and its persistent filesystem.
        </p>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="mt-3"
          disabled={remove.isPending}
          onClick={() => {
            if (!window.confirm(`Delete sandbox "${sandbox.name}"?`)) return;
            remove.mutate(sandbox.id, {
              onSuccess: () => {
                toast.success("Sandbox deleted");
                onDeleted?.();
              },
              onError: (error) => toast.error((error as Error).message),
            });
          }}
        >
          {remove.isPending ? <Spinner className="size-3" /> : <Trash2 size={14} />}
          Delete sandbox
        </Button>
      </section>
    </div>
  );
}

export { DEFAULT_SANDBOX_DETAIL_TAB };
