import { Moon, Sun } from "lucide-react";
import { Button } from "#/components/ui/button";
import { useTheme } from "#/lib/theme";
import { cn } from "#/lib/cn";

interface Props {
  className?: string;
}

export function ThemeToggle({ className }: Props) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggle}
      title={isDark ? "Switch to light" : "Switch to dark"}
      aria-label={isDark ? "Switch to light" : "Switch to dark"}
      className={cn(
        "border-[var(--color-border-hi)] rounded-[var(--radius-md)]",
        "bg-[var(--color-bg-elev)] text-[var(--color-fg-muted)]",
        "shadow-[var(--shadow-xs)]",
        "hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-row)] hover:border-[var(--color-border-strong)]",
        className,
      )}
    >
      {isDark ? <Sun size={13} /> : <Moon size={13} />}
    </Button>
  );
}
