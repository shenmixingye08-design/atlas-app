"use client";

import Link from "next/link";
import { StatusBadge, type RunVisualStatus } from "@/components/automation-first/status-badge";
import { cn } from "@/lib/design-system/cn";

export type TimelineItem = {
  id: string;
  timeLabel: string;
  title: string;
  subtitle?: string;
  status: RunVisualStatus;
  href: string;
  actionLabel?: string;
};

export type TimelineProps = {
  items: TimelineItem[];
  className?: string;
  onItemOpen?: (id: string) => void;
};

export function Timeline({ items, className, onItemOpen }: TimelineProps) {
  if (items.length === 0) return null;

  return (
    <ol className={cn("relative space-y-0", className)} aria-label="今日のタイムライン">
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
          <div className="flex w-14 shrink-0 flex-col items-end pt-0.5">
            <span className="text-[length:var(--text-meta)] font-medium tabular-nums text-[var(--text-muted)]">
              {item.timeLabel}
            </span>
          </div>
          <div className="relative flex flex-col items-center">
            <span
              className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[var(--brand)] ring-4 ring-[var(--surface)]"
              aria-hidden
            />
            {index < items.length - 1 ? (
              <span className="mt-1 w-px flex-1 bg-[var(--border)]" aria-hidden />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <StatusBadge status={item.status} />
                <p className="mt-1 truncate text-[length:var(--text-card-title)] font-semibold text-[var(--text-primary)]">
                  {item.title}
                </p>
                {item.subtitle ? (
                  <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {item.subtitle}
                  </p>
                ) : null}
              </div>
              <Link
                href={item.href}
                onClick={() => onItemOpen?.(item.id)}
                className="inline-flex min-h-9 items-center text-sm font-medium text-[var(--brand)] underline-offset-2 hover:underline"
              >
                {item.actionLabel ?? "詳細"}
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
