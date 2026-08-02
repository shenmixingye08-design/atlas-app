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
        "rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-6 py-10 text-center",
        className,
      )}
      role="status"
    >
      <h3 className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--text-secondary)]">
        {description}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {primaryHref && primaryLabel ? (
          <Link
            href={primaryHref}
            onClick={onPrimaryClick}
            className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-foreground)]"
          >
            {primaryLabel}
          </Link>
        ) : null}
        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-sm font-medium text-[var(--text-primary)]"
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
