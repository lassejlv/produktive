import {
  projectColorBackground,
  projectColorHex,
} from "@/lib/project-constants";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const sizeClass: Record<Size, string> = {
  sm: "size-4 text-[10px] rounded-[3px]",
  md: "size-5 text-[11px] rounded-[4px]",
  lg: "size-7 text-[14px] rounded-[6px]",
};

export function ProjectIcon({
  color,
  icon,
  name,
  size = "md",
  className,
}: {
  color: string;
  icon: string | null | undefined;
  name?: string;
  size?: Size;
  className?: string;
}) {
  const fg = projectColorHex[color] ?? projectColorHex.blue;
  const bg = projectColorBackground(color);
  const display = (icon ?? name?.charAt(0) ?? "•").trim() || "•";

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center font-medium leading-none",
        sizeClass[size],
        className,
      )}
      style={{
        backgroundColor: bg,
        color: fg,
      }}
      aria-hidden
    >
      {display}
    </span>
  );
}
