import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Play, FileCode, Braces, Sparkles } from "lucide-react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { useTestDsl, useUpdateMonitor, useValidateDsl, type DslError } from "../lib/queries";
import type { MonitorKind } from "../lib/types";
import { cn } from "#/lib/cn";

const MonacoDsl = lazy(() => import("./MonacoDsl"));

interface Props {
  wid: string;
  mid: string;
  initialSource: string | null;
  monitorKind: MonitorKind;
  monitorTarget: string;
  monitorInterval: number;
}

type Tab = "editor" | "json" | "preview";

const DEFAULT_TEMPLATE = (kind: string, target: string, interval: number) => `type ${kind}

set params.config {
${kind === "http" ? `  url: "${target}"` : `  host: "${target}"`}
  timeout: 5s
}

set schedule.interval ${interval}s

# Declare the shape of result.json for autocomplete.
# Example:
# declare result.json {
#   status: string
#   data: { id: number, name: string }
# }

rules {
  if result.status == 200 -> ok
  if result.status >= 500 -> down with "5xx response"
  if result.latency_ms > 2000 -> warn with "slow"
  else -> ok
}
`;

export function DslEditor({
  wid,
  mid,
  initialSource,
  monitorKind,
  monitorTarget,
  monitorInterval,
}: Props) {
  const [source, setSource] = useState<string>(
    initialSource ?? DEFAULT_TEMPLATE(monitorKind, monitorTarget, monitorInterval),
  );
  const [tab, setTab] = useState<Tab>("editor");
  const [ast, setAst] = useState<unknown | null>(null);
  const [parseError, setParseError] = useState<DslError | null>(null);
  const [dirty, setDirty] = useState(false);

  const validate = useValidateDsl(wid);
  const test = useTestDsl(wid, mid);
  const update = useUpdateMonitor(wid);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      validate.mutate(source, {
        onSuccess: (r) => {
          if (r.ok) {
            setAst(r.ast ?? null);
            setParseError(null);
          } else if (r.error) {
            setParseError(r.error);
          }
        },
        onError: (err) => {
          // server problem — don't pretend it's a parse error
          setParseError(null);
          toast.error(`validator: ${(err as Error).message}`);
        },
      });
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const ruleCount = useMemo(() => {
    const doc = ast as { rules?: unknown[] } | null;
    return doc?.rules?.length ?? 0;
  }, [ast]);

  function onSave() {
    update.mutate(
      { id: mid, patch: { dsl_source: source } },
      {
        onSuccess: () => {
          toast.success("DSL saved");
          setDirty(false);
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  function onClear() {
    if (!confirm("Clear DSL and revert to form-based config?")) return;
    update.mutate(
      { id: mid, patch: { dsl_source: null } },
      {
        onSuccess: () => {
          toast.success("DSL cleared");
          setSource(DEFAULT_TEMPLATE(monitorKind, monitorTarget, monitorInterval));
          setAst(null);
          setDirty(false);
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  function onTest() {
    test.mutate(
      { source },
      {
        onSuccess: (r) => {
          if (!r.ok) {
            toast.error(`Parse error at ${r.error?.line}:${r.error?.col}`);
            return;
          }
          if (!r.outcome) {
            toast.message("No rule matched");
            return;
          }
          const msg = `→ ${r.outcome.kind}${r.outcome.message ? ` (${r.outcome.message})` : ""}`;
          if (r.outcome.kind === "ok") toast.success(msg);
          else if (r.outcome.kind === "down") toast.error(msg);
          else toast.warning(msg);
        },
      },
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] overflow-hidden shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-sunken)] px-4 h-11">
        <div className="flex items-center gap-1">
          <TabBtn active={tab === "editor"} onClick={() => setTab("editor")} icon={FileCode}>
            Editor
          </TabBtn>
          <TabBtn active={tab === "json"} onClick={() => setTab("json")} icon={Braces}>
            JSON
          </TabBtn>
          <TabBtn active={tab === "preview"} onClick={() => setTab("preview")} icon={Sparkles}>
            Preview
          </TabBtn>
          {ruleCount > 0 && (
            <span className="ml-2 mono text-[10px] text-[var(--color-fg-dim)] uppercase tracking-wide">
              {ruleCount} rule{ruleCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusIndicator validating={validate.isPending} error={parseError} />
          <Button
            variant="ghost"
            size="sm"
            onClick={onTest}
            disabled={test.isPending || !!parseError}
          >
            {test.isPending ? <Spinner className="size-2.75" /> : <Play size={11} />}
            Test
          </Button>
          {initialSource && (
            <Button variant="ghost" size="sm" onClick={onClear} disabled={update.isPending}>
              Clear
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={update.isPending || !!parseError || !dirty}
          >
            {update.isPending && <Spinner className="size-2.75" />}
            Save
          </Button>
        </div>
      </div>

      {tab === "editor" && (
        <div className="relative">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-[360px] text-[12px] text-[var(--color-fg-muted)]">
                <Spinner className="size-4" /> <span className="ml-2">loading editor…</span>
              </div>
            }
          >
            <MonacoDsl
              value={source}
              onChange={(next) => {
                setSource(next);
                setDirty(true);
              }}
              errorLine={parseError?.line ?? null}
              errorMessage={parseError?.message ?? null}
              height={360}
            />
          </Suspense>
          {parseError && (
            <div className="border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-err)_8%,var(--color-bg-elev))] px-4 py-2.5 text-[12px] text-[var(--color-err)] mono">
              {parseError.line}:{parseError.col} — {parseError.message}
            </div>
          )}
        </div>
      )}

      {tab === "json" && (
        <pre className="m-0 mono text-[12px] text-[var(--color-fg)] px-4 py-3 bg-[var(--color-bg-sunken)] overflow-x-auto min-h-[360px] whitespace-pre">
          {ast ? JSON.stringify(ast, null, 2) : "// no AST yet"}
        </pre>
      )}

      {tab === "preview" && (
        <div className="px-4 py-4 min-h-[360px]">
          <DslPreview ast={ast} />
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileCode;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 text-[12px] rounded-[var(--radius-sm)] shadow-none",
        active
          ? "bg-[var(--color-bg-elev)] text-[var(--color-fg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)]"
          : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-transparent",
      )}
    >
      <Icon size={11} />
      {children}
    </Button>
  );
}

function StatusIndicator({ validating, error }: { validating: boolean; error: DslError | null }) {
  if (validating) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)] mono">
        <Spinner className="size-2.5" /> checking…
      </span>
    );
  }
  if (error) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-err)] mono">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-err)]" />
        error {error.line}:{error.col}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ok)] mono">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-ok)]" />
      valid
    </span>
  );
}

interface AstDoc {
  type_decl?: MonitorKind | null;
  sets?: { path: string[]; value: unknown }[];
  declares?: { path: string[]; shape: unknown }[];
  rules?: {
    kind: { kind: "if"; cond: unknown } | { kind: "else" };
    outcome: "ok" | "warn" | "down";
    message?: string | null;
  }[];
}

function DslPreview({ ast }: { ast: unknown }) {
  const doc = ast as AstDoc | null;
  if (!doc) {
    return (
      <div className="text-[12px] text-[var(--color-fg-muted)] py-8 text-center">
        Type a document to see its structure.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5 text-[13px]">
      <SectionHead label="Type" />
      <div className="mono text-[var(--color-fg)] -mt-3">{doc.type_decl ?? "—"}</div>

      <SectionHead label="Sets" />
      <div className="flex flex-col gap-1.5 -mt-3">
        {doc.sets?.length ? (
          doc.sets.map((s, i) => (
            <div key={i} className="mono text-[12px] text-[var(--color-fg)]">
              <span className="text-[var(--color-fg-muted)]">{s.path.join(".")} </span>
              <span>= </span>
              <span className="text-[var(--color-link)]">{previewValue(s.value)}</span>
            </div>
          ))
        ) : (
          <div className="text-[12px] text-[var(--color-fg-dim)]">—</div>
        )}
      </div>

      <SectionHead label={`Declares (${doc.declares?.length ?? 0})`} />
      <div className="flex flex-col gap-1.5 -mt-3">
        {doc.declares?.length ? (
          doc.declares.map((d, i) => (
            <div key={i} className="mono text-[12px] text-[var(--color-fg)]">
              <span className="text-[var(--color-fg-muted)]">{d.path.join(".")} </span>
              <span className="text-[var(--color-link)]">{shapeLabel(d.shape)}</span>
            </div>
          ))
        ) : (
          <div className="text-[12px] text-[var(--color-fg-dim)]">—</div>
        )}
      </div>

      <SectionHead label={`Rules (${doc.rules?.length ?? 0})`} />
      <div className="flex flex-col gap-1.5 -mt-3">
        {doc.rules?.length ? (
          doc.rules.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-2 mono text-[12px] text-[var(--color-fg)]"
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: outcomeColor(r.outcome) }}
              />
              <span className="text-[var(--color-fg-muted)]">
                {r.kind.kind === "if" ? "if …" : "else"}
              </span>
              <span>→</span>
              <span style={{ color: outcomeColor(r.outcome) }}>{r.outcome}</span>
              {r.message && <span className="text-[var(--color-fg-dim)]">— {r.message}</span>}
            </div>
          ))
        ) : (
          <div className="text-[12px] text-[var(--color-fg-dim)]">—</div>
        )}
      </div>
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-[var(--color-fg-dim)]">
      {label}
    </div>
  );
}

function shapeLabel(s: unknown): string {
  const v = s as { kind?: string; name?: string; fields?: unknown[]; items?: unknown };
  if (!v) return "any";
  if (v.kind === "prim") return v.name ?? "any";
  if (v.kind === "array") return `[${shapeLabel(v.items)}]`;
  if (v.kind === "object") return `{ ${v.fields?.length ?? 0} fields }`;
  return "any";
}

function previewValue(v: unknown): string {
  if (v == null || typeof v !== "object") return JSON.stringify(v);
  const obj = v as { type?: string; ms?: number; key?: string; entries?: unknown[] };
  if (obj.type === "duration" && typeof obj.ms === "number") return `${obj.ms}ms`;
  if (obj.type === "env" && obj.key) return `env("${obj.key}")`;
  if (obj.type === "string") return JSON.stringify((obj as { value: string }).value ?? "");
  if (obj.type === "number") return `${(obj as { value: number }).value}`;
  if (obj.type === "bool") return `${(obj as { value: boolean }).value}`;
  if (obj.type === "block") return `{ ${obj.entries?.length ?? 0} entries }`;
  return JSON.stringify(v);
}

function outcomeColor(o: "ok" | "warn" | "down"): string {
  switch (o) {
    case "ok":
      return "var(--color-ok)";
    case "warn":
      return "var(--color-warn)";
    case "down":
      return "var(--color-err)";
  }
}
