import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "#/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "xs" | "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

const sizeMap: Record<Size, string> = {
  xs: "px-2 h-7 text-[11px] gap-1",
  sm: "px-2.5 h-8 text-[12px] gap-1.5",
  md: "px-3.5 h-9 text-[13px] gap-1.5",
  lg: "px-4 h-10 text-[13px] gap-2",
};

const variantMap: Record<Variant, string> = {
  primary: cn(
    "bg-[var(--color-accent)] text-[var(--color-accent-fg)]",
    "border-[color-mix(in_srgb,var(--color-accent)_60%,#000_8%)]",
    "shadow-[inset_0_1px_0_color-mix(in_srgb,#fff_22%,transparent),var(--shadow-sm)]",
    "hover:bg-[color-mix(in_srgb,var(--color-accent)_92%,#000)]",
    "active:translate-y-[0.5px]",
  ),
  secondary: cn(
    "bg-[var(--color-bg-elev)] text-[var(--color-fg)]",
    "border-[var(--color-border-hi)]",
    "shadow-[var(--shadow-xs)]",
    "hover:bg-[var(--color-bg-row)] hover:border-[var(--color-border-strong)]",
  ),
  subtle: cn(
    "bg-[var(--color-bg-row)] text-[var(--color-fg)]",
    "border-transparent",
    "hover:bg-[color-mix(in_srgb,var(--color-bg-row)_60%,var(--color-bg-sunken))]",
  ),
  ghost: cn(
    "bg-transparent border-transparent text-[var(--color-fg-muted)]",
    "hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-row)]",
  ),
  danger: cn(
    "bg-transparent text-[var(--color-err)]",
    "border-[color-mix(in_srgb,var(--color-err)_55%,var(--color-border))]",
    "hover:bg-[color-mix(in_srgb,var(--color-err)_10%,transparent)]",
    "hover:border-[var(--color-err)]",
  ),
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cn(
        "inline-flex items-center justify-center font-medium select-none",
        "border rounded-[var(--radius-md)] whitespace-nowrap",
        "transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-55",
        sizeMap[size],
        variantMap[variant],
        className,
      )}
    >
      {children}
    </button>
  );
});
