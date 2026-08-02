"use client";

import Link from "next/link";
import { cn } from "@/lib/design-system/cn";

export type EmptyStateProps = {
  title: string;
  description: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  onPrimaryClick?: () => void;
  className?: string;
};

export function EmptyState({
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  onPrimaryClick,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "af-card border-dashed px-6 py-10 text-center",
        className,
      )}
      role="status"
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-4">
        <div className="space-y-2">
          <h3 className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--text-secondary)]">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {primaryHref && primaryLabel ? (
            <Link
              href={primaryHref}
              onClick={onPrimaryClick}
              className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--brand-foreground)] shadow-[var(--shadow-sm)] transition-[opacity,transform] duration-[var(--motion-base)] hover:bg-[var(--brand-hover)] active:scale-[0.99]"
            >
              {primaryLabel}
            </Link>
          ) : null}
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-5 text-sm font-medium text-[var(--text-primary)] transition-[background-color,transform] duration-[var(--motion-base)] hover:bg-[var(--surface-muted)] active:scale-[0.99]"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
