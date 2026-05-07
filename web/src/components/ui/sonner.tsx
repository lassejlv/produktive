import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      offset={16}
      gap={10}
      toastOptions={{
        classNames: {
          toast: [
            "group relative !rounded-[14px]",
            "!border !border-border-subtle/80 !bg-bg/85 !text-fg",
            "!backdrop-blur-2xl",
            "widget-panel-shadow",
            "before:content-[''] before:pointer-events-none before:absolute",
            "before:inset-x-6 before:top-0 before:h-px",
            "before:bg-gradient-to-r before:from-transparent before:via-fg-muted/40 before:to-transparent",
          ].join(" "),
          title: "!text-fg !text-[13px] !font-medium !tracking-tight",
          description: "!text-fg-muted !text-[12px] !leading-[1.5]",
          actionButton: [
            "!h-7 !rounded-[7px] !px-2.5 !text-[11.5px] !font-medium",
            "!bg-fg !text-bg",
            "hover:!bg-fg/90 transition-colors",
          ].join(" "),
          cancelButton: [
            "!h-7 !rounded-[7px] !px-2.5 !text-[11.5px]",
            "!bg-transparent !border !border-border-subtle !text-fg-muted",
            "hover:!text-fg hover:!border-border transition-colors",
          ].join(" "),
          closeButton: [
            "!size-5 !rounded-md",
            "!bg-bg/85 !border-border-subtle !text-fg-faint !backdrop-blur-md",
            "hover:!text-fg hover:!border-border transition-colors",
          ].join(" "),
          icon: "!text-fg-muted",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-danger",
          warning: "[&_[data-icon]]:!text-warning",
          info: "[&_[data-icon]]:!text-fg-muted",
          loading: "[&_[data-icon]]:!text-fg-muted",
        },
      }}
      {...props}
    />
  );
}
