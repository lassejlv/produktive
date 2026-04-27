import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-medium uppercase tracking-[0.14em] text-[11px] transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vermilion focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-y-[1px]",
  {
    variants: {
      variant: {
        default:
          "bg-ink text-paper-soft hover:bg-vermilion shadow-[3px_3px_0_0_var(--color-ink)] hover:shadow-[3px_3px_0_0_var(--color-vermilion)] hover:-translate-x-[1px] hover:-translate-y-[1px]",
        outline:
          "bg-transparent text-ink border border-ink hover:bg-ink hover:text-paper-soft",
        ghost:
          "bg-transparent text-ink hover:bg-paper-deep tracking-[0.1em]",
        secondary:
          "bg-paper-deep text-ink border border-ink/15 hover:border-ink hover:bg-paper",
        vermilion:
          "bg-vermilion text-paper-soft hover:bg-ink shadow-[3px_3px_0_0_var(--color-ink)]",
        link:
          "bg-transparent text-ink underline underline-offset-4 decoration-1 hover:text-vermilion hover:decoration-vermilion px-0",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3.5 text-[10px]",
        lg: "h-12 px-7 text-[12px]",
        icon: "h-10 w-10",
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
