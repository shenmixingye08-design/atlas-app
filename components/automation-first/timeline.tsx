"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge, type RunVisualStatus } from "@/components/automation-first/status-badge";
import { cn } from "@/lib/design-system/cn";

export type TimelineItem = {
  id: string;
  timeLabel: string;
  title: string;
  subtitle?: string;
  status: RunVisualStatus;
  statusLabel?: string;
  currentStep?: string | null;
  nextAction?: string;
  artifactLabel?: string | null;
  href: string;
  actionLabel?: string;
};

export type TimelineProps = {
  items: TimelineItem[];
  className?: string;
  onItemOpen?: (id: string) => void;
};

export function Timeline({ items, className, onItemOpen }: TimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <ol className={cn("relative space-y-0", className)} aria-label="今日のタイムライン">
      {items.map((item, index) => {
        const expanded = expandedId === item.id;
        const longName = item.title.length > 28;
        return (
          <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
            <div className="flex w-14 shrink-0 flex-col items-end pt-1 sm:w-16">
              <span className="text-[length:var(--text-label)] font-semibold tabular-nums text-[var(--text-secondary)]">
                {item.timeLabel}
              </span>
            </div>
            <div className="relative flex flex-col items-center">
              <span
                className={cn(
                  "mt-2 size-2.5 shrink-0 rounded-full ring-4 ring-[var(--surface)]",
                  item.status === "failed" && "bg-[var(--status-failed)]",
                  item.status === "pending_approval" &&
                    "bg-[var(--status-pending-approval)]",
                  item.status === "needs_input" && "bg-[var(--status-needs-input)]",
                  item.status === "running" && "bg-[var(--status-running)]",
                  item.status === "completed" && "bg-[var(--status-completed)]",
                  item.status === "scheduled" && "bg-[var(--brand)]",
                  !["failed", "pending_approval", "needs_input", "running", "completed", "scheduled"].includes(
                    item.status,
                  ) && "bg-[var(--brand)]",
                )}
                aria-hidden
              />
              {index < items.length - 1 ? (
                <span className="mt-1 w-px flex-1 bg-[var(--border)]" aria-hidden />
              ) : null}
            </div>
            <div className="af-card min-w-0 flex-1 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <StatusBadge status={item.status} label={item.statusLabel} />
                  <button
                    type="button"
                    className={cn(
                      "mt-1.5 block w-full text-left text-[length:var(--text-card-title)] font-semibold text-[var(--text-primary)]",
                      !expanded && "truncate",
                    )}
                    onClick={() =>
                      longName
                        ? setExpandedId(expanded ? null : item.id)
                        : undefined
                    }
                    aria-expanded={longName ? expanded : undefined}
                  >
                    {item.title}
                  </button>
                  {item.currentStep ? (
                    <p className="mt-1 text-[length:var(--text-body)] text-[var(--text-secondary)]">
                      現在: {item.currentStep}
                    </p>
                  ) : null}
                  {item.subtitle ? (
                    <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {item.subtitle}
                    </p>
                  ) : null}
                  {item.artifactLabel ? (
                    <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                      成果物: {item.artifactLabel}
                    </p>
                  ) : null}
                </div>
                <Link
                  href={item.href}
                  onClick={() => onItemOpen?.(item.id)}
                  className="inline-flex min-h-[var(--touch-target)] items-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
                >
                  {item.actionLabel ?? item.nextAction ?? "詳細"}
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
