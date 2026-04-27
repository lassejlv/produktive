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
    <label className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs text-fg transition-colors hover:bg-surface-2">
      {icon}
      <span className="capitalize">{value}</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
