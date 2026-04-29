import type { ReactNode } from "react";

export function SettingRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-border-subtle py-3 text-[13px] md:grid-cols-[140px_minmax(0,1fr)]">
      <div className="text-fg-faint">{label}</div>
      <div className="min-w-0 text-fg">{children}</div>
    </div>
  );
}
