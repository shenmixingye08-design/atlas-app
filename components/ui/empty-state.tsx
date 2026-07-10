import { cn } from "@/lib/design-system/cn";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-2xl)] px-6 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--surface-muted)] text-2xl ring-1 ring-[var(--border)]">
          {icon}
        </div>
      )}
      <h3 className="text-title text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-caption">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
