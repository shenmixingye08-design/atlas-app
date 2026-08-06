"use client";

import Link from "next/link";
import { IconEmptyWork } from "@/components/ui/icons";
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
        "animate-card-enter rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[linear-gradient(180deg,var(--surface-elevated)_0%,var(--surface-muted)_100%)] px-5 py-8 text-center",
        className,
      )}
      role="status"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-muted)] text-[var(--brand)]">
        <IconEmptyWork className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]">
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
            className="btn-brand"
          >
            {primaryLabel}
          </Link>
        ) : null}
        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className="inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-sm font-medium text-[var(--text-primary)] transition-transform duration-[var(--motion-fast)] active:scale-[0.98]"
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
