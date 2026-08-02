"use client";

import Link from "next/link";
import { StatusBadge, type RunVisualStatus } from "@/components/automation-first/status-badge";
import { cn } from "@/lib/design-system/cn";

export type AutomationRowProps = {
  id: string;
  name: string;
  description?: string;
  status: RunVisualStatus;
  nextRunLabel?: string;
  lastRunLabel?: string;
  href: string;
  className?: string;
};

export function AutomationRow({
  id,
  name,
  description,
  status,
  nextRunLabel,
  lastRunLabel,
  href,
  className,
}: AutomationRowProps) {
  return (
    <Link
      href={href}
      data-automation-id={id}
      className={cn(
        "grid grid-cols-1 gap-2 border-b border-[var(--border)] px-3 py-3 transition-colors hover:bg-[var(--surface-muted)] sm:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4",
        "min-h-[var(--touch-target)]",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-[length:var(--text-card-title)] font-semibold text-[var(--text-primary)]">
          {name}
        </p>
        {description ? (
          <p className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      <StatusBadge status={status} />
      <p className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-secondary)]">
        次回 {nextRunLabel ?? "—"}
      </p>
      <p className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
        最終 {lastRunLabel ?? "—"}
      </p>
    </Link>
  );
}
