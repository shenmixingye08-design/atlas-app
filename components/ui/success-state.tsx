import { cn } from "@/lib/design-system/cn";

type SuccessStateProps = {
  message: string;
  className?: string;
  onDismiss?: () => void;
};

export function SuccessState({ message, className, onDismiss }: SuccessStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-xl)] border border-[var(--status-success)]/25 bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success)] animate-check-in",
        className,
      )}
    >
      <span aria-hidden="true">✓</span>
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-[var(--status-success)]/70 hover:text-[var(--status-success)] focus-ring rounded"
          aria-label="閉じる"
        >
          ×
        </button>
      )}
    </div>
  );
}
