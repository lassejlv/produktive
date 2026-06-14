import { useMemo } from "react";
import { ChartTooltip, Grid, Line, LineChart, XAxis } from "#/charts";

export interface ResponseTimePoint {
  /** X position on the time axis. */
  date: Date;
  /** Latency in ms; `null` means no response (down / timeout). */
  ms: number | null;
  /** Whether the underlying check was up. Defaults to `ms != null`. */
  up?: boolean;
  /** Optional secondary tooltip line (e.g. an error message or "avg over N checks"). */
  label?: string;
}

interface Props {
  /** Chronological, oldest-to-newest. */
  points: ResponseTimePoint[];
  /** Pixel height of the chart. Default: 200. */
  height?: number;
  /** Render the chart's own shimmer/loading state. */
  loading?: boolean;
}

/** Internal row shape handed to the vendored bklit chart. */
interface Row extends Record<string, unknown> {
  date: Date;
  /** Numeric series value the line plots (`ms ?? 0` so down checks sit at baseline). */
  latency: number;
  ms: number | null;
  up: boolean;
  label?: string;
}

/**
 * Response-time line chart built on the vendored bklit composable chart
 * (`web/src/charts`). Themed through the `--chart-*` tokens in `styles.css`.
 */
export function ResponseTimeChart({ points, height = 200, loading = false }: Props) {
  const data = useMemo<Row[]>(
    () =>
      points.map((p) => ({
        date: p.date,
        latency: p.ms ?? 0,
        ms: p.ms,
        up: p.up ?? p.ms != null,
        label: p.label,
      })),
    [points],
  );

  return (
    <LineChart
      data={data}
      xDataKey="date"
      aspectRatio=""
      style={{ height }}
      status={loading ? "loading" : "ready"}
      loadingLabel={loading ? "Loading response times" : undefined}
      margin={{ top: 16, right: 10, bottom: 26, left: 10 }}
    >
      <Grid horizontal numTicksRows={4} />
      <Line dataKey="latency" strokeWidth={1.75} />
      <XAxis numTicks={5} />
      <ChartTooltip
        rows={(point) => {
          const row = point as Row;
          const up = row.up;
          return [
            {
              color: up ? "var(--chart-line-primary)" : "var(--color-err)",
              label: "Response",
              value: typeof row.ms === "number" ? `${Math.round(row.ms)} ms` : "No response",
            },
            ...(row.label ? [{ color: "var(--color-fg-dim)", label: "", value: row.label }] : []),
          ];
        }}
        dotColor={(point) => ((point as Row).up ? "var(--chart-line-primary)" : "var(--color-err)")}
      />
    </LineChart>
  );
}
