import type * as React from "react";
import { cn } from "@/lib/utils";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-sidebar text-fg md:h-screen md:overflow-hidden">
      {children}
    </div>
  );
}

export function Sidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      className={cn(
        "hidden w-[260px] shrink-0 flex-col bg-sidebar text-fg md:flex",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("px-4 pb-5 pt-4", className)} {...props} />
  );
}

export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex-1 overflow-auto p-4", className)} {...props} />
  );
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("p-4", className)} {...props} />
  );
}

export function SidebarMenu({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-0.5", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-w-0", className)} {...props} />;
}

export function SidebarMenuButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "relative min-w-0 flex-1 bg-bg",
        "md:my-1.5 md:mr-1.5 md:overflow-auto md:rounded-xl md:border md:border-border-subtle md:shadow-[0_2px_12px_rgba(0,0,0,0.25)]",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarTrigger() {
  return (
    <button
      className="grid size-8 place-items-center rounded-md border border-border bg-surface text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg md:hidden"
      aria-label="Open navigation"
      type="button"
    >
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
        <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}
