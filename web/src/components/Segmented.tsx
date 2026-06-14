import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "#/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label?: ReactNode;
  icon?: LucideIcon;
  title?: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: Props<T>) {
  const h = size === "sm" ? "h-6" : "h-8";
  const pad = size === "sm" ? "px-1.5" : "px-2.5";
  const text = size === "sm" ? "text-[10.5px]" : "text-[12px]";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-md)]",
        "bg-[var(--color-bg-row)] border border-[var(--color-border)]",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            disabled={opt.disabled}
            onClick={() => {
              if (!opt.disabled) onChange(opt.value);
            }}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] font-medium",
              "transition-[background-color,color,box-shadow] duration-150 ease-out",
              h,
              pad,
              text,
              opt.label ? "" : "aspect-square",
              active
                ? "bg-[var(--color-bg-elev)] text-[var(--color-fg)] shadow-[var(--shadow-xs)] border border-[var(--color-border-hi)]"
                : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-transparent",
              opt.disabled && "cursor-not-allowed opacity-45 hover:text-[var(--color-fg-muted)]",
            )}
          >
            {Icon && <Icon size={size === "sm" ? 13 : 14} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
