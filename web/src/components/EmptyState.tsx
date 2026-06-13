import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16 fade-in">
      <div className="text-center max-w-[400px]">
        {Icon && (
          <div className="mx-auto mb-5 w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center bg-[var(--color-bg-row)] border border-[var(--color-border)] text-[var(--color-fg-muted)]">
            <Icon size={18} />
          </div>
        )}
        <h2 className="text-[16px] tracking-tight font-medium mb-1.5 text-[var(--color-fg)]">
          {title}
        </h2>
        {description && (
          <p className="text-[var(--color-fg-muted)] text-[13px] leading-relaxed mb-5">
            {description}
          </p>
        )}
        {action}
      </div>
    </div>
  );
}
