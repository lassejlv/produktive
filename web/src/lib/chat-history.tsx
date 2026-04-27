export const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

export const firstName = (full?: string | null) => {
  if (!full) return null;
  return full.trim().split(/\s+/)[0] || null;
};

export const truncateTitle = (text: string, max = 48) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-border-subtle bg-surface px-1.5 py-px font-mono text-[12.5px]">
      {children}
    </code>
  );
}
