import { cn } from "@/lib/design-system/cn";
import { USER_SOFT_RETRY_MESSAGE } from "@/lib/reliability/ops-progress";

type ErrorStateProps = {
  message?: string;
  title?: string;
  className?: string;
};

/**
 * P06: Not an "error screen". Users only see soft auto-retry copy.
 * Technical details in message/title are ignored.
 */
export function ErrorState({ message, title, className }: ErrorStateProps) {
  void message;
  void title;
  const soft = USER_SOFT_RETRY_MESSAGE;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3 animate-fade-in",
        className,
      )}
    >
      <p className="whitespace-pre-line text-sm text-[var(--text-primary)]">
        {soft}
      </p>
    </div>
  );
}
