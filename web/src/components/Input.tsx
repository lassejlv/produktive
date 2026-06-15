import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "#/components/ui/field";
import { Input as UIInput } from "#/components/ui/input";
import { cn } from "#/lib/utils";

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
    <Field className="gap-1.5">
      {label ? <FieldLabel htmlFor={auto}>{label}</FieldLabel> : null}
      <span
        className={cn(
          "flex w-full items-center",
          hasAffix && "gap-2 px-3 [&_[data-slot=input-control]]:border-0 [&_[data-slot=input-control]]:shadow-none",
        )}
      >
        {leading ? (
          <span className="flex shrink-0 items-center text-[13px] text-muted-foreground">
            {leading}
          </span>
        ) : null}
        <UIInput
          id={auto}
          ref={ref}
          aria-invalid={error ? true : undefined}
          className={cn("flex-1", className)}
          {...rest}
        />
        {trailing ? (
          <span className="flex shrink-0 items-center text-[13px] text-muted-foreground">
            {trailing}
          </span>
        ) : null}
      </span>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : hint ? (
        <FieldDescription>{hint}</FieldDescription>
      ) : null}
    </Field>
  );
});
