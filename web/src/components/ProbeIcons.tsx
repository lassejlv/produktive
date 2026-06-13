import type { ReactElement, ReactNode, SVGProps } from "react";
import type { MonitorKind } from "../lib/types";

export type ProbeIconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  size?: number;
};

export type ProbeIcon = (props: ProbeIconProps) => ReactElement;

function Svg({ size = 14, children, ...rest }: ProbeIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Globe with an outbound request arrow. */
export function HttpIcon(props: ProbeIconProps) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="13.5" r="7" />
      <path d="M3.5 13.5h14" />
      <ellipse cx="10.5" cy="13.5" rx="3" ry="7" />
      <path d="M15.8 8.2 21 3" />
      <path d="M16.8 3H21v4.2" />
    </Svg>
  );
}

/** Two endpoints exchanging packets both ways. */
export function TcpIcon(props: ProbeIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 7.5v9" />
      <path d="M19.5 7.5v9" />
      <path d="M8 9.5h7.5" />
      <path d="m13 7 2.5 2.5L13 12" />
      <path d="M16 14.5H8.5" />
      <path d="M11 12l-2.5 2.5L11 17" />
    </Svg>
  );
}

/** Sonar: a dot emitting expanding echo arcs. */
export function PingIcon(props: ProbeIconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.9" fill="currentColor" stroke="none" />
      <path d="M9.5 8.8a5.2 5.2 0 0 1 0 6.4" />
      <path d="M13 6.4a8.6 8.6 0 0 1 0 11.2" />
      <path d="M16.5 4a12 12 0 0 1 0 16" />
    </Svg>
  );
}

/** Minimal Slonik: elephant head in profile, trunk hanging left. */
export function PostgresIcon(props: ProbeIconProps) {
  return (
    <Svg {...props}>
      <path d="M19 10a7 7 0 0 0-14 0v8a1.5 1.5 0 0 0 3 0v-4.5c0 1.5 1.2 2.7 2.7 2.7h3.3a5 5 0 0 0 5-5V10Z" />
      <circle cx="8.9" cy="9.8" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** The Redis mark: stacked cushion layers with the dipped top edge. */
export function RedisIcon(props: ProbeIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 7l3.7-1.6 3.8 1 3.8-1L19.5 7 12 10.2Z" />
      <path d="M4.5 11.6 12 14.8l7.5-3.2" />
      <path d="M4.5 16.2 12 19.4l7.5-3.2" />
    </Svg>
  );
}

/** Terminal window with prompt and cursor. */
export function SshIcon(props: ProbeIconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="m7 9.25 3.2 2.75L7 14.75" />
      <path d="M13 15h4" />
    </Svg>
  );
}

export const PROBE_ICON: Record<MonitorKind, ProbeIcon> = {
  http: HttpIcon,
  tcp: TcpIcon,
  ping: PingIcon,
  postgres: PostgresIcon,
  redis: RedisIcon,
  ssh: SshIcon,
};
