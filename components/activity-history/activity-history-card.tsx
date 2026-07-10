"use client";

import { formatDuration, getCategoryIcon, type ActivityHistoryItem } from "@/lib/activity-history";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

type ActivityHistoryCardProps = {
  item: ActivityHistoryItem;
  selected?: boolean;
  onSelect?: (item: ActivityHistoryItem) => void;
  variant?: "interactive" | "static";
};

const STATUS_CLASS: Record<string, string> = {
  completed: "bg-[var(--success-bg)] text-[var(--success)]",
  running: "bg-[var(--accent-muted)] text-[var(--accent)]",
  review: "bg-[var(--warning-bg)] text-[var(--warning)]",
  pending: "bg-[var(--status-neutral-bg)] text-[var(--text-muted)]",
  failed: "bg-[var(--error-bg)] text-[var(--error)]",
};

const CARD_CLASS =
  "activity-history-card w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-sm)] transition-all sm:p-5";

export function ActivityHistoryCard({
  item,
  selected,
  onSelect,
  variant = "interactive",
}: ActivityHistoryCardProps) {
  const statusLabel =
    ui.activityHistory.statuses[item.status as keyof typeof ui.activityHistory.statuses] ??
    item.status;

  const content = (
    <>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-lg">
          {getCategoryIcon(item.category)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{item.title}</p>
            {item.metadata.favorite ? (
              <span aria-hidden className="text-amber-500">
                ★
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">
            {item.workRequest}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[var(--text-secondary)]">
              {new Date(item.completedAt).toLocaleString("ja-JP")}
            </span>
            <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[var(--text-secondary)]">
              {item.categoryLabel}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 font-medium",
                STATUS_CLASS[item.status] ?? STATUS_CLASS.review,
              )}
            >
              {statusLabel}
            </span>
            <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[var(--text-secondary)]">
              {formatDuration(item.durationMs)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-[var(--text-muted)]">
            {item.employees.slice(0, 3).map((employee) => (
              <span key={employee}>{employee}</span>
            ))}
            {item.services.map((service) => (
              <span key={service} className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5">
                {service}
              </span>
            ))}
          </div>
          {item.metadata.memoryLearned ? (
            <p className="mt-2 text-xs text-[var(--accent)]">
              {ui.activityHistory.memoryLearned}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );

  if (variant === "static") {
    return (
      <div
        className={cn(
          CARD_CLASS,
          "hover:border-[var(--border-strong)]",
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={cn(
        CARD_CLASS,
        "hover:border-[var(--border-strong)]",
        selected && "border-[var(--accent)] ring-2 ring-[var(--accent)]/20",
      )}
    >
      {content}
    </button>
  );
}
