import { useState } from "react";
import { Check, Minus, X } from "lucide-react";
import { STATUS_COLOR } from "../../lib/status";
import type {
  DayBucket,
  PublicIncident,
  PublicMonitor,
  PublicOverall,
  StatusStyle,
} from "../../lib/types";
import { ActiveIncidents, MiniIncidentHistory } from "./Incidents";
import { StatusShell } from "./StatusShell";

export interface RenderGroup {
  id: string;
  name: string | null;
  monitors: PublicMonitor[];
}

interface Props {
  title: string;
  description?: string | null;
  overall: PublicOverall;
  groups: RenderGroup[];
  incidents?: PublicIncident[];
  /** Link to the full `<status>/incidents` page; omitted in editor previews. */
  incidentsHref?: string;
  style: StatusStyle;
  /** Rendered inside the editor (no fixed min-height, no live links). */
  preview?: boolean;
}

const OVERALL_TEXT: Record<PublicOverall, string> = {
  up: "All systems operational",
  degraded: "Partial system degradation",
  down: "Some systems are down",
  unknown: "Awaiting data",
};

type DayStatus = "up" | "degraded" | "down" | "none";

/** Classify a day for the bar color. Any blip is degraded; a sustained outage is down. */
function dayStatus(d: DayBucket): DayStatus {
  if (d.total === 0) return "none";
  if (d.down === 0 && d.degraded === 0) return "up";
  if (d.down > 0 && d.down / d.total >= 0.1) return "down";
  return "degraded";
}

const DAY_COLOR: Record<DayStatus, string> = {
  up: "var(--color-ok)",
  degraded: "var(--color-warn)",
  down: "var(--color-err)",
  none: "var(--color-border-hi)",
};

const DAY_LABEL: Record<DayStatus, string> = {
  up: "Operational",
  degraded: "Degraded",
  down: "Outage",
  none: "No data",
};

/** Day uptime treats degraded as available — only hard-down checks count against it. */
function dayUptime(d: DayBucket): number | null {
  if (d.total === 0) return null;
  return ((d.total - d.down) / d.total) * 100;
}

function windowUptime(history: DayBucket[]): number | null {
  let total = 0;
  let down = 0;
  for (const d of history) {
    total += d.total;
    down += d.down;
  }
  if (total === 0) return null;
  return ((total - down) / total) * 100;
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  // Avoid "100.00" rounding up from 99.998 etc.; clamp display.
  return `${(Math.floor(v * 100) / 100).toFixed(2)}%`;
}

function fmtDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function StatusView({
  title,
  description,
  overall,
  groups,
  incidents = [],
  incidentsHref,
  style,
  preview,
}: Props) {
  const monitors = groups.flatMap((g) => g.monitors);
  const affected = monitors.filter(
    (m) => m.status === "down" || m.status === "degraded",
  );
  const openIncidents = incidents.filter((i) => i.status === "open");
  const pastIncidents = incidents.filter((i) => i.status !== "open");

  return (
    <StatusShell
      title={title}
      style={style}
      documentTitle={`${title} — ${OVERALL_TEXT[overall]}`}
      preview={preview}
    >
      <div className={description ? "pb-6 pt-6" : "pt-6"}>
        {description && (
          <p className="text-[13px] leading-relaxed text-(--color-fg-muted)">
            {description}
          </p>
        )}
      </div>

      {/* what's broken should never be buried — open incidents sit above the card */}
      <ActiveIncidents incidents={openIncidents} className="mb-4" />

      {/* the status card: centered overall headline + components */}
      <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-5 py-6 shadow-[var(--shadow-sm)] sm:px-7">
        <div className="flex flex-col items-center gap-2 pb-7 pt-1 text-center">
          <div className="flex min-w-0 items-center gap-2.5">
            <Medallion tone={overall} size={22} />
            <h2 className="truncate text-[16.5px] font-semibold tracking-tight text-[var(--color-fg)]">
              {OVERALL_TEXT[overall]}
            </h2>
          </div>
          {affected.length > 0 && (
            <p className="text-[12px] text-[var(--color-fg-muted)]">
              {affectedSummary(affected)}
            </p>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="border-t border-[var(--color-border)] py-10 text-center text-[13px] text-[var(--color-fg-muted)]">
            No components are being monitored yet.
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-6">
                {g.name && (
                  <h3 className="-mb-2 px-0.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-dim)]">
                    {g.name}
                  </h3>
                )}
                {g.monitors.map((m) => (
                  <MonitorRow key={m.id} m={m} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* resolved incident history (active ones are pinned above) */}
      <MiniIncidentHistory
        incidents={pastIncidents}
        href={incidentsHref}
        className="mt-10"
      />
    </StatusShell>
  );
}

/** "Checkout degraded · Redis cache down · +2 more" — capped, worst first. */
function affectedSummary(affected: PublicMonitor[]): string {
  const sorted = [...affected].sort(
    (a, b) => (a.status === "down" ? -1 : 1) - (b.status === "down" ? -1 : 1),
  );
  const shown = sorted
    .slice(0, 3)
    .map((m) => `${m.name} ${m.status === "down" ? "down" : "degraded"}`);
  const more = sorted.length - shown.length;
  return more > 0 ? `${shown.join(" · ")} · +${more} more` : shown.join(" · ");
}

/** Tiny exclamation glyph — lucide has no bare "!" for the degraded medallion. */
function Exclaim({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 6v7" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}

/** Filled status circle with a glyph, instatus-style. */
function Medallion({
  tone,
  size,
}: {
  tone: "up" | "degraded" | "down" | "unknown";
  size: number;
}) {
  const glyph = Math.round(size * 0.6);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: STATUS_COLOR[tone],
        color: "var(--color-bg)",
      }}
    >
      {tone === "up" ? (
        <Check size={glyph} strokeWidth={3.5} />
      ) : tone === "down" ? (
        <X size={glyph} strokeWidth={3.5} />
      ) : tone === "degraded" ? (
        <Exclaim size={glyph} />
      ) : (
        <Minus size={glyph} strokeWidth={3.5} />
      )}
    </span>
  );
}

function MonitorRow({ m }: { m: PublicMonitor }) {
  const uptime = windowUptime(m.history);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Medallion tone={m.status} size={16} />
          <span className="truncate text-[13px] font-medium tracking-tight text-[var(--color-fg)]">
            {m.name}
          </span>
          {m.last_latency_ms != null && m.status !== "down" && (
            <span className="mono tabular hidden text-[10.5px] text-[var(--color-fg-dim)] sm:inline">
              {m.last_latency_ms} ms
            </span>
          )}
        </div>
        <span
          className="tabular shrink-0 text-[12px] font-medium tracking-tight"
          style={{
            color:
              uptime === null ? "var(--color-fg-dim)" : STATUS_COLOR[m.status],
          }}
        >
          {uptime === null ? "No data" : `${fmtPct(uptime)} uptime`}
        </span>
      </div>

      <UptimeBar history={m.history} />

      <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-[var(--color-fg-dim)]">
        <span>
          {m.history.length > 0 ? `${m.history.length} days ago` : "—"}
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}

function UptimeBar({ history }: { history: DayBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (history.length === 0) {
    return (
      <div className="flex h-8 items-center text-[11px] text-[var(--color-fg-dim)]">
        No history yet.
      </div>
    );
  }

  const day = hover !== null ? history[hover] : null;
  // Tick center as a percentage of the bar — drives both tooltip and arrow.
  const pct = hover !== null ? ((hover + 0.5) / history.length) * 100 : 0;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div className="flex h-8 items-stretch gap-[1px] overflow-hidden rounded-[5px]">
        {history.map((d, i) => {
          const s = dayStatus(d);
          return (
            <span
              key={d.date}
              onMouseEnter={() => setHover(i)}
              className="min-w-[2px] flex-1 transition-opacity duration-100"
              style={{
                background: DAY_COLOR[s],
                opacity: s === "none" ? 0.35 : hover === i ? 1 : 0.85,
              }}
            />
          );
        })}
      </div>

      {day && (
        <>
          <div
            className="fade-in pointer-events-none absolute bottom-[calc(100%+10px)] z-20 w-[180px] -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] px-3 py-2.5 shadow-[var(--shadow-pop)]"
            style={{ left: `clamp(90px, ${pct}%, calc(100% - 90px))` }}
            role="tooltip"
          >
            <div className="text-[11px] font-medium text-[var(--color-fg)]">
              {fmtDay(day.date)}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: DAY_COLOR[dayStatus(day)] }}
              />
              <span
                className="text-[11.5px] font-medium"
                style={{
                  color:
                    dayStatus(day) === "none"
                      ? "var(--color-fg-muted)"
                      : DAY_COLOR[dayStatus(day)],
                }}
              >
                {DAY_LABEL[dayStatus(day)]}
              </span>
            </div>
            {dayStatus(day) === "none" ? (
              <div className="mt-1 text-[11px] text-[var(--color-fg-dim)]">
                No checks recorded
              </div>
            ) : (
              <>
                <div className="tabular mt-1 text-[11px] text-[var(--color-fg-muted)]">
                  {fmtPct(dayUptime(day))} uptime · {day.total} checks
                </div>
                {(day.down > 0 || day.degraded > 0) && (
                  <div className="tabular mt-0.5 text-[11px] text-[var(--color-fg-dim)]">
                    {[
                      day.down > 0 ? `${day.down} failed` : null,
                      day.degraded > 0 ? `${day.degraded} degraded` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </>
            )}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[calc(100%+6px)] z-30 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-[var(--color-border-hi)] bg-[var(--color-bg-elev)]"
            style={{ left: `clamp(8px, ${pct}%, calc(100% - 8px))` }}
          />
        </>
      )}
    </div>
  );
}
