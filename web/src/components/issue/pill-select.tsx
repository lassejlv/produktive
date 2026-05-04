import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function PillSelect({
  value,
  onChange,
  options,
  icon,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  icon: React.ReactNode;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-7 w-auto justify-start gap-1.5 border-border bg-surface px-2 text-xs hover:bg-surface-2 [&>svg]:ml-0",
          className,
        )}
      >
        {icon}
        <span className="capitalize">{value}</span>
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
