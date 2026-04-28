import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "border border-border bg-surface text-fg shadow-xl rounded-[8px]",
          title: "text-fg text-[13px]",
          description: "text-fg-muted text-[12px]",
          actionButton: "bg-fg text-bg",
          cancelButton: "bg-surface-3 text-fg",
          closeButton: "bg-surface border-border text-fg",
        },
      }}
      {...props}
    />
  );
}
