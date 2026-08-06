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
        "animate-card-enter flex flex-col items-center justify-center rounded-[var(--radius-2xl)] bg-[linear-gradient(180deg,var(--surface-elevated),var(--surface-muted))] px-5 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--brand-muted)] text-[var(--brand)] ring-1 ring-[var(--border)]">
          {icon}
        </div>
      ) : null}
      <h3 className="text-title text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-caption">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
