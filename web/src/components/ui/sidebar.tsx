import type * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full bg-background">{children}</div>;
}

export function Sidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      className={cn(
        "hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-b border-sidebar-border p-4", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex-1 overflow-auto p-3", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-t border-sidebar-border p-3", className)} {...props} />;
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
        "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-[0.98]",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return <main className={cn("min-w-0 flex-1", className)} {...props} />;
}

export function SidebarTrigger() {
  return (
    <Button className="md:hidden" size="icon" variant="ghost" aria-label="Open navigation">
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 16 16"
      >
        <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </Button>
  );
}
