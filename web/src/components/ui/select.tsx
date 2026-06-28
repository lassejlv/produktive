"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown } from "lucide-react";
import type * as React from "react";
import { cn } from "#/lib/utils";

export const Select: typeof SelectPrimitive.Root = SelectPrimitive.Root;

export const selectTriggerVariants = cva(
  [
    "inline-flex w-full min-w-0 select-none items-center justify-between gap-2",
    "rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)]",
    "text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none",
    "transition-[border-color,box-shadow] duration-150",
    "focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--ring-accent)]",
    "aria-invalid:border-[var(--color-err)]",
    "focus-visible:aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-err)_24%,transparent)]",
    "data-disabled:pointer-events-none data-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    defaultVariants: {
      size: "default",
    },
    variants: {
      size: {
        default: "h-9 px-3 text-[13px] sm:h-8 sm:text-sm",
        lg: "h-10 px-3 text-sm sm:h-9",
        sm: "h-8 gap-1.5 px-2.5 text-[12px] sm:h-7",
      },
    },
  },
);

export const selectTriggerIconClassName =
  "size-3.5 text-[var(--color-fg-muted)] opacity-70 transition-[opacity,transform] duration-150 group-data-popup-open:rotate-180 group-data-popup-open:opacity-100";

export interface SelectButtonProps extends useRender.ComponentProps<"button"> {
  size?: VariantProps<typeof selectTriggerVariants>["size"];
}

export function SelectButton({
  className,
  size,
  render,
  children,
  ...props
}: SelectButtonProps): React.ReactElement {
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
    render ? undefined : "button";

  const defaultProps = {
    children: (
      <>
        <span className="min-w-0 flex-1 truncate in-data-placeholder:text-[var(--color-fg-dim)]">
          {children}
        </span>
        <ChevronDown className={selectTriggerIconClassName} />
      </>
    ),
    className: cn(selectTriggerVariants({ size }), "group min-w-0", className),
    "data-slot": "select-button",
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

export function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props &
  VariantProps<typeof selectTriggerVariants>): React.ReactElement {
  return (
    <SelectPrimitive.Trigger
      className={cn(selectTriggerVariants({ size }), "group", className)}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon data-slot="select-icon">
        <ChevronDown className={selectTriggerIconClassName} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectValue({
  className,
  ...props
}: SelectPrimitive.Value.Props): React.ReactElement {
  return (
    <SelectPrimitive.Value
      className={cn(
        "min-w-0 flex-1 truncate text-left data-placeholder:text-[var(--color-fg-dim)]",
        className,
      )}
      data-slot="select-value"
      {...props}
    />
  );
}

export function SelectPopup({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  anchor,
  portalProps,
  ...props
}: SelectPrimitive.Popup.Props & {
  portalProps?: SelectPrimitive.Portal.Props;
  side?: SelectPrimitive.Positioner.Props["side"];
  sideOffset?: SelectPrimitive.Positioner.Props["sideOffset"];
  align?: SelectPrimitive.Positioner.Props["align"];
  alignOffset?: SelectPrimitive.Positioner.Props["alignOffset"];
  alignItemWithTrigger?: SelectPrimitive.Positioner.Props["alignItemWithTrigger"];
  anchor?: SelectPrimitive.Positioner.Props["anchor"];
}): React.ReactElement {
  return (
    <SelectPrimitive.Portal {...portalProps}>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-50 select-none"
        data-slot="select-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            "origin-(--transform-origin) min-w-[var(--anchor-width)] overflow-hidden rounded-[var(--radius-md)]",
            "border border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg)]",
            "shadow-[var(--shadow-lg)] outline-none",
            "transition-[transform,opacity] duration-150",
            "data-starting-style:scale-98 data-starting-style:opacity-0",
            className,
          )}
          data-slot="select-popup"
          {...props}
        >
          <SelectPrimitive.List
            className="max-h-[min(var(--available-height),18rem)] overflow-y-auto overscroll-y-contain p-1"
            data-slot="select-list"
          >
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props): React.ReactElement {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex min-h-7 cursor-default select-none items-center rounded-[var(--radius-sm)] py-1.5 pl-7 pr-2",
        "text-[12px] text-[var(--color-fg)] outline-none",
        "data-highlighted:bg-[var(--color-bg-row)] data-highlighted:text-[var(--color-fg)]",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      data-slot="select-item"
      {...props}
    >
      <SelectPrimitive.ItemIndicator
        className="absolute left-1.5 flex size-4 items-center justify-center text-[var(--color-accent)]"
        data-slot="select-item-indicator"
      >
        <Check className="size-3.5" strokeWidth={2.5} />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="min-w-0 truncate">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props): React.ReactElement {
  return (
    <SelectPrimitive.Separator
      className={cn("mx-2 my-1 h-px bg-[var(--color-border)]", className)}
      data-slot="select-separator"
      {...props}
    />
  );
}

export function SelectGroup(
  props: SelectPrimitive.Group.Props,
): React.ReactElement {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

export function SelectLabel({
  className,
  ...props
}: SelectPrimitive.Label.Props): React.ReactElement {
  return (
    <SelectPrimitive.Label
      className={cn(
        "not-in-data-[slot=field]:mb-2 inline-flex cursor-default items-center gap-2 text-[13px] font-medium text-[var(--color-fg)] sm:text-sm",
        className,
      )}
      data-slot="select-label"
      {...props}
    />
  );
}

export function SelectGroupLabel(
  props: SelectPrimitive.GroupLabel.Props,
): React.ReactElement {
  return (
    <SelectPrimitive.GroupLabel
      className="px-2 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)]"
      data-slot="select-group-label"
      {...props}
    />
  );
}

export { SelectPrimitive, SelectPopup as SelectContent };
