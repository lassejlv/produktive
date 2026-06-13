import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PageSkeleton } from "../components/PageLayout";
import { Spinner } from "../components/Spinner";
import { Segmented } from "../components/Segmented";
import { StatusBuilder } from "../components/status/StatusBuilder";
import { StatusView } from "../components/status/StatusView";
import {
  useCreateCustomDomain,
  useCustomDomains,
  useDeleteCustomDomain,
  useMonitors,
  usePublicStatus,
  useUpdateWorkspace,
  useVerifyCustomDomain,
  useWorkspaces,
} from "../lib/queries";
import {
  type CustomDomain,
  DEFAULT_STATUS_STYLE,
  type StatusGroup,
  type StatusStyle,
  type StatusTheme,
  type WorkspacePatch,
} from "../lib/types";
import { cn } from "#/lib/cn";

export const Route = createFileRoute("/_authed/$wid/status")({
  staticData: { title: "Status page", layout: "bare" },
  component: StatusPageSettings,
});

const ACCENTS = [
  { label: "Emerald", value: null },
  { label: "Blue", value: "#3b82f6" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Slate", value: "#64748b" },
];

function StatusPageSettings() {
  const { wid } = Route.useParams();
  const qc = useQueryClient();
  const ws = useWorkspaces();
  const current = ws.data?.find((w) => w.id === wid || w.slug === wid);
  const { data: monitors = [] } = useMonitors(wid);
  const update = useUpdateWorkspace(wid);
  const customDomains = useCustomDomains(wid);
  const createDomain = useCreateCustomDomain(wid);
  const verifyDomain = useVerifyCustomDomain(wid);
  const deleteDomain = useDeleteCustomDomain(wid);

  /** null = derive from publish state once the workspace loads. */
  const [mode, setMode] = useState<"preview" | "edit" | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [style, setStyle] = useState<StatusStyle>(DEFAULT_STATUS_STYLE);
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [domain, setDomain] = useState("");

  useEffect(() => {
    if (!current) return;
    setSlug(current.status_slug ?? "");
    setTitle(current.status_page_title ?? "");
    setDescription(current.status_page_description ?? "");
    setEnabled(current.status_page_enabled);
    setStyle(current.status_page_config?.style ?? DEFAULT_STATUS_STYLE);
    setGroups(current.status_page_config?.groups ?? []);
    setHidden(current.status_page_config?.hidden_monitor_ids ?? []);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hiddenSet = new Set(hidden);
  const toggleHidden = (id: string) =>
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  if (ws.isLoading) {
    return (
      <div className="max-w-6xl px-6 py-8 lg:px-8">
        <PageSkeleton />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="max-w-6xl px-6 py-8 text-[13px] text-[var(--color-fg-muted)] lg:px-8">
        Workspace not found.
      </div>
    );
  }

  const publicUrl = current.status_slug
    ? `${window.location.origin}/s/${current.status_slug}`
    : null;
  const isLive = Boolean(current.status_slug) && current.status_page_enabled;
  const resolvedMode = mode ?? (isLive ? "preview" : "edit");

  const save = () => {
    const patch: WorkspacePatch = {
      status_slug: slug ? slug : null,
      status_page_enabled: enabled,
      status_page_title: title || null,
      status_page_description: description || null,
      status_page_config: { style, groups, hidden_monitor_ids: hidden },
    };
    update.mutate(patch, {
      onSuccess: () => {
        toast.success("Status page saved");
        // Refresh the live preview with the new config.
        void qc.invalidateQueries({ queryKey: ["public-status"] });
      },
      onError: (err) => toast.error((err as Error).message),
    });
  };

  const patchStyle = (p: Partial<StatusStyle>) => setStyle((s) => ({ ...s, ...p }));

  return (
    <div className="max-w-3xl px-6 lg:px-8 py-8 fade-in flex flex-col gap-5">
      {/* editor banner — clarifies this is the public page; one primary per mode */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-sunken)] px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-[var(--color-fg-muted)]">
          <Globe size={14} className="shrink-0" />
          <span className="shrink-0">Public page ·</span>
          {publicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="mono truncate text-[var(--color-fg)] no-underline hover:text-[var(--color-link)]"
            >
              {publicUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <span className="text-[var(--color-fg-dim)]">not published yet</span>
          )}
          <span
            className={cn(
              "shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.06em]",
              isLive
                ? "border-[color-mix(in_srgb,var(--color-ok)_40%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-ok)_10%,transparent)] text-[var(--color-ok)]"
                : "border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]",
            )}
          >
            {isLive ? "live" : "offline"}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {resolvedMode === "preview" ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setMode("edit")}>
                <Pencil size={13} /> Edit
              </Button>
              {publicUrl && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              )}
            </>
          ) : (
            <>
              {isLive && (
                <Button variant="ghost" size="sm" onClick={() => setMode("preview")}>
                  <ExternalLink size={13} /> Preview
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={save} disabled={update.isPending}>
                {update.isPending && <Spinner size={12} thickness={2} />}
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </>
          )}
        </div>
      </div>

      {resolvedMode === "preview" && current.status_slug ? (
        <LivePreview slug={current.status_slug} />
      ) : (
        renderEditorSections()
      )}
    </div>
  );

  function renderEditorSections() {
    return (
      <div className="min-w-0 divide-y divide-[var(--color-border)]">
        {/* access */}
        <div className="flex items-start justify-between gap-4 py-7 first:pt-0">
          <div>
            <div className="text-[14px] font-medium text-[var(--color-fg)]">Public access</div>
            <div className="text-[var(--color-fg-muted)] text-[12.5px] mt-1">
              When enabled, anyone with the URL can view your page.
            </div>
          </div>
          <Toggle value={enabled} onChange={setEnabled} />
        </div>

        {/* details */}
        <Section label="Details">
          <div className="flex flex-col gap-5">
            <Input
              label="Slug"
              placeholder="acme"
              leading={
                <span className="mono text-[12px]">
                  {window.location.origin.replace(/^https?:\/\//, "")}/s/
                </span>
              }
              value={slug}
              hint="Lowercase letters, digits, hyphens. 3–32 chars."
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
            <Input
              label="Title"
              placeholder={current?.name}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[var(--color-fg-muted)] tracking-wide">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="px-3 py-2.5 bg-[var(--color-bg-elev)] border border-[var(--color-border-hi)] focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)] focus:outline-none rounded-[var(--radius-md)] text-[13px] resize-none transition-all shadow-[var(--shadow-xs)]"
                placeholder="Real-time uptime and incident history."
              />
            </label>
          </div>
        </Section>

        {/* appearance */}
        <Section label="Appearance">
          <div className="flex flex-col gap-5">
            <Field label="Theme">
              <Segmented<StatusTheme>
                value={style.theme}
                onChange={(t) => patchStyle({ theme: t })}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </Field>

            <Field label="Accent">
              <div className="flex items-center gap-2 flex-wrap">
                {ACCENTS.map((a) => {
                  const sel = (style.accent ?? null) === a.value;
                  const c = a.value ?? "#10b981";
                  return (
                    <button
                      key={a.label}
                      type="button"
                      title={a.label}
                      onClick={() => patchStyle({ accent: a.value })}
                      className={cn(
                        "w-7 h-7 rounded-full border transition-transform hover:scale-110",
                        sel
                          ? "ring-2 ring-offset-2 ring-offset-[var(--color-bg)]"
                          : "border-[var(--color-border-hi)]",
                      )}
                      style={{
                        background: c,
                        borderColor: c,
                        boxShadow: sel ? `0 0 0 2px ${c}` : undefined,
                      }}
                    />
                  );
                })}
                <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)] cursor-pointer">
                  <input
                    type="color"
                    value={style.accent ?? "#10b981"}
                    onChange={(e) => patchStyle({ accent: e.target.value })}
                    className="w-7 h-7 rounded-full border border-[var(--color-border-hi)] bg-transparent cursor-pointer p-0"
                  />
                  Custom
                </label>
              </div>
            </Field>

            <Input
              label="Logo URL"
              placeholder="https://…/logo.svg"
              value={style.logo_url ?? ""}
              onChange={(e) => patchStyle({ logo_url: e.target.value || null })}
            />
            <Input
              label="Header link"
              placeholder="https://yourapp.com"
              value={style.header_link ?? ""}
              onChange={(e) => patchStyle({ header_link: e.target.value || null })}
            />
          </div>
        </Section>

        {/* groups */}
        <Section label="Components & groups">
          {monitors.length === 0 ? (
            <div className="text-[13px] text-[var(--color-fg-muted)]">
              No monitors yet. Create monitors first, then organize them into groups.
            </div>
          ) : (
            <>
              <p className="mb-3 text-[12.5px] text-[var(--color-fg-muted)]">
                Drag to group components. Use the eye toggle to choose which appear on the public
                page.
              </p>
              <StatusBuilder
                monitors={monitors}
                groups={groups}
                onChange={setGroups}
                hidden={hiddenSet}
                onToggleHidden={toggleHidden}
              />
            </>
          )}
        </Section>

        <Section label="Custom domains">
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-end gap-2">
                <Input
                  label="Domain"
                  placeholder="status.example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value.toLowerCase())}
                  hint="Connect a custom hostname to this public status page."
                />
                <Button
                  type="button"
                  disabled={createDomain.isPending || !enabled || !domain.trim()}
                  onClick={() => {
                    createDomain.mutate(domain, {
                      onSuccess: () => {
                        setDomain("");
                        toast.success("Custom domain created");
                      },
                      onError: (err) => toast.error((err as Error).message),
                    });
                  }}
                >
                  {createDomain.isPending && <Spinner size={12} thickness={2} />}
                  Add
                </Button>
              </div>
              {!enabled && (
                <div className="mt-2 text-[12px] text-[var(--color-fg-muted)]">
                  Enable public access before adding a custom domain.
                </div>
              )}
            </div>

            <div className="flex flex-col divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
              {(customDomains.data ?? []).length === 0 ? (
                <div className="px-4 py-5 text-[13px] text-[var(--color-fg-muted)]">
                  No custom domains yet.
                </div>
              ) : (
                customDomains.data?.map((d) => (
                  <CustomDomainRow
                    key={d.id}
                    domain={d}
                    isVerifying={verifyDomain.isPending && verifyDomain.variables === d.id}
                    onVerify={() =>
                      verifyDomain.mutate(d.id, {
                        onSuccess: () => toast.success("Custom domain verified"),
                        onError: (err) => toast.error((err as Error).message),
                      })
                    }
                    onDelete={() =>
                      deleteDomain.mutate(d.id, {
                        onSuccess: () => toast.success("Custom domain removed"),
                        onError: (err) => toast.error((err as Error).message),
                      })
                    }
                  />
                ))
              )}
            </div>
          </div>
        </Section>
      </div>
    );
  }
}

/** The page itself, on paper — a live render of the public status page. */
function LivePreview({ slug }: { slug: string }) {
  const { data, isLoading } = usePublicStatus(slug);
  if (isLoading) return <div className="shimmer h-80 rounded-[var(--radius-lg)]" />;
  if (!data) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-8 text-center text-[13px] text-[var(--color-fg-muted)]">
        Could not load the public page. It may still be propagating — try again shortly.
      </div>
    );
  }
  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-sm)]">
        <StatusView
          preview
          title={data.title ?? data.workspace_name}
          description={data.description}
          overall={data.overall}
          groups={data.groups}
          incidents={data.incidents ?? []}
          style={data.style ?? DEFAULT_STATUS_STYLE}
          generatedAt={data.generated_at}
        />
      </div>
      <div className="text-center text-[11.5px] text-[var(--color-fg-dim)]">
        Live render of <span className="mono">/s/{slug}</span> — exactly what visitors see.
      </div>
    </>
  );
}

function CustomDomainRow({
  domain,
  isVerifying,
  onVerify,
  onDelete,
}: {
  domain: CustomDomain;
  isVerifying: boolean;
  onVerify: () => void;
  onDelete: () => void;
}) {
  const verified = Boolean(domain.verified_at);
  const records = dnsRecords(domain);
  const [recordsOpen, setRecordsOpen] = useState(!verified);
  const [activeRecord, setActiveRecord] = useState<DnsRecordKind>(records[0]?.kind ?? "txt");
  const selectedRecord = records.find((record) => record.kind === activeRecord) ?? records[0];

  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">
              {domain.hostname}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium",
                verified
                  ? "border-[color-mix(in_srgb,var(--color-ok)_40%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-ok)_10%,transparent)] text-[var(--color-ok)]"
                  : "border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]",
              )}
            >
              {verified ? "Verified" : "Pending"}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-fg-dim)]">
            {verified ? "Ready for traffic." : "Add the verification record, then verify."}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setRecordsOpen((open) => !open)}
          >
            {recordsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Records
          </Button>
          {!verified && (
            <Button type="button" size="xs" onClick={onVerify} disabled={isVerifying}>
              {isVerifying && <Spinner size={12} thickness={2} />}
              Verify
            </Button>
          )}
          <Button type="button" variant="ghost" size="xs" onClick={onDelete}>
            <Trash2 size={12} /> Remove
          </Button>
        </div>
      </div>
      {recordsOpen && selectedRecord && (
        <div className="mt-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-sunken)] p-2">
          <div className="flex items-center justify-between gap-3">
            <Segmented
              value={selectedRecord.kind}
              onChange={(value) => setActiveRecord(value)}
              size="sm"
              options={records.map((record) => ({
                value: record.kind,
                label: record.label,
              }))}
            />
            <span className="hidden text-[11px] text-[var(--color-fg-dim)] sm:inline">
              {selectedRecord.hint}
            </span>
          </div>
          <DnsRecordView record={selectedRecord} />
        </div>
      )}
    </div>
  );
}

type DnsRecordKind = "txt" | "cname" | "a" | "aaaa";

type DnsRecord = {
  kind: DnsRecordKind;
  label: string;
  type: string;
  name: string;
  value: string;
  hint: string;
};

function dnsRecords(domain: CustomDomain): DnsRecord[] {
  const records: DnsRecord[] = [
    {
      kind: "txt",
      label: "TXT",
      type: "TXT",
      name: domain.verification_name,
      value: domain.verification_value,
      hint: "Proves ownership",
    },
    {
      kind: "cname",
      label: "CNAME",
      type: "CNAME",
      name: domain.hostname,
      value: domain.cname_target,
      hint: "Best for subdomains",
    },
  ];
  if (domain.proxy_ipv4) {
    records.push({
      kind: "a",
      label: "A",
      type: "A",
      name: domain.hostname,
      value: domain.proxy_ipv4,
      hint: "For apex domains",
    });
  }
  if (domain.proxy_ipv6) {
    records.push({
      kind: "aaaa",
      label: "AAAA",
      type: "AAAA",
      name: domain.hostname,
      value: domain.proxy_ipv6,
      hint: "Optional IPv6",
    });
  }
  return records;
}

function DnsRecordView({ record }: { record: DnsRecord }) {
  return (
    <div className="mt-2 grid gap-1.5">
      <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5">
        <span className="text-[10.5px] font-medium text-[var(--color-fg-dim)]">Name</span>
        <code className="mono truncate text-[11px] text-[var(--color-fg)]">{record.name}</code>
      </div>
      <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5">
        <span className="text-[10.5px] font-medium text-[var(--color-fg-dim)]">{record.type}</span>
        <code className="mono truncate text-[11px] text-[var(--color-fg)]">{record.value}</code>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="py-7 first:pt-0">
      <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-[var(--color-fg-dim)] mb-4">
        {label}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-medium text-[var(--color-fg-muted)] tracking-wide">
        {label}
      </span>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "relative w-10 h-6 rounded-full border transition-all shrink-0",
        value
          ? "bg-[var(--color-accent)] border-[var(--color-accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
          : "bg-[var(--color-bg-sunken)] border-[var(--color-border-hi)]",
      )}
      aria-pressed={value}
    >
      <span
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full transition-all",
          value
            ? "bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]"
            : "bg-[var(--color-fg-dim)]",
        )}
        style={{ left: value ? "20px" : "2px" }}
      />
    </button>
  );
}
