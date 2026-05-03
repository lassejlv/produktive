import { cn } from "@/lib/utils";

export function SidebarSectionHeader({
  icon,
  label,
  collapsed,
  onToggle,
  trailing,
  groupClass,
}: {
  icon?: React.ReactNode;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
  groupClass?: string;
}) {
  return (
    <div className={cn("flex w-full items-center gap-1 px-2 pb-1.5", groupClass)}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        className="flex flex-1 items-center gap-1.5 rounded-[4px] py-px text-left text-fg-faint transition-colors hover:text-fg-muted"
      >
        <SectionChevron collapsed={collapsed} />
        {icon}
        <span className="text-[10.5px] font-medium uppercase tracking-[0.08em]">{label}</span>
      </button>
      {trailing}
    </div>
  );
}

export function SectionChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      style={{
        transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
        transition: "transform 120ms ease",
      }}
    >
      <path
        d="M3 4.5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowOutIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M4.5 7.5L9 3M5 3h4v4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 6v3a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
