import type * as React from "react";
import { cn } from "@/lib/utils";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full">{children}</div>;
}

export function Sidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      className={cn(
        "hidden w-72 shrink-0 flex-col border-r border-ink bg-paper-deep text-ink md:flex",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("border-b border-ink p-5", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex-1 overflow-auto p-4", className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("border-t border-ink p-4", className)}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid", className)} {...props} />;
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
        "group relative flex w-full items-center gap-3 border-b border-ink/10 px-2 py-3 text-left text-[13px] font-medium text-ink transition-all duration-200 last:border-b-0 hover:bg-paper hover:pl-3",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main className={cn("min-w-0 flex-1 bg-paper", className)} {...props} />
  );
}

export function SidebarTrigger() {
  return (
    <button
      className="grid size-9 place-items-center border border-ink bg-paper-soft text-ink transition-all hover:bg-ink hover:text-paper-soft md:hidden"
      aria-label="Open navigation"
      type="button"
    >
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
        <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </button>
  );
}
