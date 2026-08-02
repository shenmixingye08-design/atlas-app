"use client";

import { cn } from "@/lib/design-system/cn";

export type ErrorStateProps = {
  title?: string;
  description: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  title = "読み込めませんでした",
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--error)]/30 bg-[var(--error-bg)] px-5 py-6",
        className,
      )}
      role="alert"
    >
      <h3 className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mt-1 text-[length:var(--text-body)] text-[var(--text-secondary)]">
        {description}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-sm font-medium text-[var(--text-primary)]"
        >
          再試行
        </button>
      ) : null}
    </div>
  );
}
