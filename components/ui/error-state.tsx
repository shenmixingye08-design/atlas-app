import { cn } from "@/lib/design-system/cn";

type ErrorStateProps = {
  message: string;
  title?: string;
  className?: string;
};

export function ErrorState({ message, title, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-[var(--radius-xl)] border border-[var(--status-error)]/25 bg-[var(--status-error-bg)] px-4 py-3 animate-fade-in",
        className,
      )}
    >
      {title && (
        <p className="text-sm font-medium text-[var(--status-error)]">{title}</p>
      )}
      <p className={cn("text-sm text-[var(--status-error)]/90", title && "mt-1")}>
        {message}
      </p>
    </div>
  );
}
