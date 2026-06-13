import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "#/lib/cn";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, hint, error, leading, trailing, className, id, ...rest },
  ref,
) {
  const reactId = useId();
  const auto = id ?? `i-${reactId}`;
  const hasAffix = !!leading || !!trailing;
  return (
    <label htmlFor={auto} className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[12px] font-medium text-[var(--color-fg-muted)] tracking-wide">
          {label}
        </span>
      )}
      <div
        className={cn(
          "flex items-center bg-[var(--color-bg-elev)]",
          "border rounded-[var(--radius-md)]",
          "transition-[border-color,box-shadow,background-color] duration-150 ease-out",
          "border-[var(--color-border-hi)]",
          "focus-within:border-[var(--color-accent)] focus-within:shadow-[var(--ring-accent)]",
          "shadow-[var(--shadow-xs)]",
          error &&
            "border-[var(--color-err)] focus-within:border-[var(--color-err)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-err)_22%,transparent)]",
          hasAffix && "px-3",
        )}
      >
        {leading && (
          <span className="pr-2 text-[var(--color-fg-muted)] text-[13px] flex items-center">
            {leading}
          </span>
        )}
        <input
          id={auto}
          ref={ref}
          {...rest}
          className={cn(
            "flex-1 bg-transparent outline-none h-9 text-[13px] text-[var(--color-fg)]",
            "placeholder:text-[var(--color-fg-dim)]",
            !hasAffix && "px-3",
            className,
          )}
        />
        {trailing && (
          <span className="pl-2 text-[var(--color-fg-muted)] text-[13px] flex items-center">
            {trailing}
          </span>
        )}
      </div>
      {error ? (
        <span className="text-[12px] text-[var(--color-err)]">{error}</span>
      ) : hint ? (
        <span className="text-[12px] text-[var(--color-fg-dim)]">{hint}</span>
      ) : null}
    </label>
  );
});
