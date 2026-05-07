import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 select-none whitespace-nowrap",
    "rounded-[8px] text-sm font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.2,0.7,0.2,1)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "active:translate-y-px",
  ),
  {
    variants: {
      variant: {
        default: "bg-fg text-bg btn-default-shadow hover:bg-fg/95",
        outline: cn(
          "border border-border-subtle bg-surface/30 text-fg backdrop-blur-sm",
          "shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--color-fg)_5%,transparent)]",
          "hover:border-border hover:bg-surface/70 hover:text-fg",
        ),
        ghost: "bg-transparent text-fg hover:bg-surface/70",
        danger: "bg-danger text-white btn-danger-shadow hover:bg-danger/95",
        link: "bg-transparent text-accent hover:underline underline-offset-4 px-0",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
