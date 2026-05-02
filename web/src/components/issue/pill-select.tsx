import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export function PillSelect({
  value,
  onChange,
  options,
  icon,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  icon: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-7 w-auto justify-start gap-1.5 border-border bg-surface px-2 text-xs hover:bg-surface-2 [&>svg]:ml-0"
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
