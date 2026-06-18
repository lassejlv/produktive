import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { Input } from "../components/Input";
import { PageSkeleton } from "../components/PageLayout";
import { Spinner } from "#/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs";
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

const ACCENTS: Array<{ label: string; value: string | null }> = [
  { label: "Emerald", value: null },
  { label: "Blue", value: "#3b82f6" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Slate", value: "#64748b" },
];

type Section = "page" | "style" | "components" | "domains";

const SECTIONS: Array<{ value: Section; label: string; hint: string }> = [
  { value: "page", label: "Page", hint: "Address, title, and visibility." },
  { value: "style", label: "Style", hint: "Theme, accent, and branding." },
  { value: "components", label: "Components", hint: "Group and order your monitors." },
  { value: "domains", label: "Domains", hint: "Serve the page from your own host." },
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

  const [section, setSection] = useState<Section>("page");
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
      <div className="mx-auto max-w-2xl px-6 py-8">
        <PageSkeleton />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8 text-[13px] text-[var(--color-fg-muted)]">
        Workspace not found.
      </div>
    );
  }

  const publicUrl = current.status_slug
    ? `${window.location.origin}/s/${current.status_slug}`
    : null;
  const isLive = Boolean(current.status_slug) && current.status_page_enabled;
  const canPreview = Boolean(current.status_slug);

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
        void qc.invalidateQueries({ queryKey: ["public-status"] });
      },
      onError: (err) => toast.error((err as Error).message),
    });
  };

  const copyUrl = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const patchStyle = (p: Partial<StatusStyle>) => setStyle((s) => ({ ...s, ...p }));

  const activeHint = SECTIONS.find((s) => s.value === section)?.hint;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 fade-in">
      <header className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-medium tracking-tight text-[var(--color-fg)]">
              Status page
            </h1>
            <StatusPill live={isLive} />
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-1">
            {publicUrl ? (
              <>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mono truncate text-[12.5px] text-[var(--color-fg-muted)] no-underline hover:text-[var(--color-link)]"
                >
                  {publicUrl.replace(/^https?:\/\//, "")}
                </a>
                <button
                  type="button"
                  onClick={copyUrl}
                  aria-label="Copy public URL"
                  className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-fg-dim)] transition-colors hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open public page"
                  className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-fg-dim)] no-underline transition-colors hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]"
                >
                  <ExternalLink size={13} />
                </a>
              </>
            ) : (
              <p className="text-[12.5px] text-[var(--color-fg-dim)]">
                No address yet — add a slug to publish.
              </p>
            )}
          </div>
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={save}
          disabled={update.isPending}
          className="shrink-0 self-start"
        >
          {update.isPending && <Spinner className="size-3" />}
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Editor */}
        <div className="min-w-0">
          <Tabs
            value={section}
            onValueChange={(value) => setSection(value as Section)}
            className="gap-0"
          >
            <TabsList variant="underline" className="w-full justify-start">
              {SECTIONS.map((s) => (
                <TabsTab key={s.value} value={s.value}>
                  {s.label}
                </TabsTab>
              ))}
            </TabsList>

            {activeHint && (
              <p className="mt-3 text-[12px] text-[var(--color-fg-dim)]">{activeHint}</p>
            )}

            <TabsPanel value="page" className="pt-5">
              <Row
                label="Public page"
                hint="Anyone with the address can view it."
                action={<Toggle value={enabled} onChange={setEnabled} />}
              />
              <div className="mt-6 flex flex-col gap-4">
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
                  placeholder={current.name}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">
                    Description
                  </span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="resize-none rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] px-3 py-2.5 text-[13px] shadow-[var(--shadow-xs)] transition-all focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)] focus:outline-none"
                    placeholder="Real-time uptime and incident history."
                  />
                </label>
              </div>
            </TabsPanel>

            <TabsPanel value="style" className="pt-5">
              <div className="flex flex-col gap-4">
                <Field label="Theme">
                  <Segmented<StatusTheme>
                    value={style.theme}
                    onChange={(t) => patchStyle({ theme: t })}
                    size="sm"
                    options={[
                      { value: "auto", label: "Auto" },
                      { value: "light", label: "Light" },
                      { value: "dark", label: "Dark" },
                    ]}
                  />
                </Field>

                <Field label="Accent">
                  <div className="flex flex-wrap items-center gap-2">
                    {ACCENTS.map((a) => {
                      const selected = (style.accent ?? null) === a.value;
                      const color = a.value ?? "#10b981";
                      return (
                        <button
                          key={a.label}
                          type="button"
                          title={a.label}
                          onClick={() => patchStyle({ accent: a.value })}
                          className={cn(
                            "size-6 rounded-full border transition-[box-shadow,opacity]",
                            selected
                              ? "opacity-100 shadow-[0_0_0_2px_var(--color-bg),0_0_0_3px_var(--color-fg-dim)]"
                              : "opacity-70 hover:opacity-100",
                          )}
                          style={{ background: color, borderColor: color }}
                        />
                      );
                    })}
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
                      <input
                        type="color"
                        value={style.accent ?? "#10b981"}
                        onChange={(e) => patchStyle({ accent: e.target.value })}
                        className="size-6 cursor-pointer rounded-full border border-[var(--color-border-hi)] bg-transparent p-0"
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
            </TabsPanel>

            <TabsPanel value="components" className="pt-5">
              {monitors.length === 0 ? (
                <EmptyHint>Create monitors first, then group them for the public page.</EmptyHint>
              ) : (
                <StatusBuilder
                  monitors={monitors}
                  groups={groups}
                  onChange={setGroups}
                  hidden={hiddenSet}
                  onToggleHidden={toggleHidden}
                />
              )}
            </TabsPanel>

            <TabsPanel value="domains" className="pt-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-end gap-2">
                  <Input
                    label="Custom domain"
                    placeholder="status.example.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value.toLowerCase())}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
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
                    {createDomain.isPending && <Spinner className="size-3" />}
                    Add
                  </Button>
                </div>
                {!enabled && (
                  <p className="text-[12px] text-[var(--color-fg-muted)]">
                    Enable the public page before adding a domain.
                  </p>
                )}

                {(customDomains.data ?? []).length === 0 ? (
                  <EmptyHint>No custom domains yet.</EmptyHint>
                ) : (
                  <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
                    {customDomains.data?.map((d) => (
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
                    ))}
                  </div>
                )}
              </div>
            </TabsPanel>
          </Tabs>
        </div>

        {/* Live preview */}
        <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              Preview
            </span>
            <span className="text-[11px] text-[var(--color-fg-dim)]">
              Reflects saved monitors · styling updates live
            </span>
          </div>
          {canPreview && current.status_slug ? (
            <LivePreview
              slug={current.status_slug}
              style={style}
              title={title}
              description={description}
            />
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-row)] px-6 text-center">
              <p className="text-[13px] text-[var(--color-fg-muted)]">Nothing to preview yet</p>
              <p className="text-[12px] text-[var(--color-fg-dim)]">
                Add a slug and save to see your public page here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        live
          ? "border-[color-mix(in_srgb,var(--color-ok)_40%,transparent)] text-[var(--color-ok)]"
          : "border-[var(--color-border)] text-[var(--color-fg-dim)]",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          live ? "bg-[var(--color-ok)]" : "bg-[var(--color-fg-dim)]",
        )}
      />
      {live ? "Live" : "Offline"}
    </span>
  );
}

function LivePreview({
  slug,
  style,
  title,
  description,
}: {
  slug: string;
  style: StatusStyle;
  title: string;
  description: string;
}) {
  const { data, isLoading } = usePublicStatus(slug);
  if (isLoading) return <div className="shimmer h-72 rounded-[var(--radius-lg)]" />;
  if (!data) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] px-6 text-center text-[13px] text-[var(--color-fg-muted)]">
        Could not load the public page. Try again shortly.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-sm)]">
      <StatusView
        preview
        title={title || data.title || data.workspace_name}
        description={description || data.description}
        overall={data.overall}
        groups={data.groups}
        incidents={data.incidents ?? []}
        style={style}
      />
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-4 py-5 text-center text-[13px] text-[var(--color-fg-muted)]">
      {children}
    </div>
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
  const [open, setOpen] = useState(!verified);
  const [activeRecord, setActiveRecord] = useState<DnsRecordKind>(records[0]?.kind ?? "txt");
  const selectedRecord = records.find((record) => record.kind === activeRecord) ?? records[0];

  return (
    <div className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-[var(--color-fg)]">{domain.hostname}</p>
          <p className="mt-0.5 text-[12px] text-[var(--color-fg-dim)]">
            {verified ? "Verified" : "Pending verification"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={() => setOpen((v) => !v)}>
            <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
            DNS
          </Button>
          {!verified && (
            <Button type="button" size="xs" onClick={onVerify} disabled={isVerifying}>
              {isVerifying && <Spinner className="size-3" />}
              Verify
            </Button>
          )}
          <Button type="button" variant="ghost" size="xs" onClick={onDelete}>
            <Trash2 size={12} />
          </Button>
        </div>
      </div>

      {open && selectedRecord && (
        <div className="mt-3 space-y-3">
          <Segmented
            value={selectedRecord.kind}
            onChange={setActiveRecord}
            size="sm"
            options={records.map((record) => ({
              value: record.kind,
              label: record.label,
            }))}
          />
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
};

function dnsRecords(domain: CustomDomain): DnsRecord[] {
  const records: DnsRecord[] = [
    {
      kind: "txt",
      label: "TXT",
      type: "TXT",
      name: domain.verification_name,
      value: domain.verification_value,
    },
    {
      kind: "cname",
      label: "CNAME",
      type: "CNAME",
      name: domain.hostname,
      value: domain.cname_target,
    },
  ];
  if (domain.proxy_ipv4) {
    records.push({
      kind: "a",
      label: "A",
      type: "A",
      name: domain.hostname,
      value: domain.proxy_ipv4,
    });
  }
  if (domain.proxy_ipv6) {
    records.push({
      kind: "aaaa",
      label: "AAAA",
      type: "AAAA",
      name: domain.hostname,
      value: domain.proxy_ipv6,
    });
  }
  return records;
}

function DnsRecordView({ record }: { record: DnsRecord }) {
  return (
    <div className="space-y-1.5 font-mono text-[11px] text-[var(--color-fg-muted)]">
      <p>
        <span className="text-[var(--color-fg-dim)]">name</span> {record.name}
      </p>
      <p>
        <span className="text-[var(--color-fg-dim)]">{record.type.toLowerCase()}</span>{" "}
        {record.value}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] text-[var(--color-fg-muted)]">{label}</span>
      {children}
    </div>
  );
}

function Row({ label, hint, action }: { label: string; hint?: string; action: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] text-[var(--color-fg)]">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full border transition-colors",
        value
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
          : "border-[var(--color-border-hi)] bg-[var(--color-bg-sunken)]",
      )}
      aria-pressed={value}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full transition-all",
          value ? "left-5 bg-[var(--color-bg-elev)]" : "left-0.5 bg-[var(--color-fg-dim)]",
        )}
      />
    </button>
  );
}
