"use client";

import {
  formatDuration,
  getCategoryIcon,
  type ActivityHistoryItem,
} from "@/lib/activity-history";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import {
  IconDownload,
  IconReuse,
  IconShare,
  IconUser,
} from "@/components/ui/icons";

type ActivityHistoryCardProps = {
  item: ActivityHistoryItem;
  selected?: boolean;
  onSelect?: (item: ActivityHistoryItem) => void;
  onReuse?: (item: ActivityHistoryItem) => void;
  onShare?: (item: ActivityHistoryItem) => void;
  onDownload?: (item: ActivityHistoryItem) => void;
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
  "activity-history-card w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-left shadow-[var(--shadow-sm)] transition-all duration-[var(--motion-fast)] sm:p-3.5";

export function ActivityHistoryCard({
  item,
  selected,
  onSelect,
  onReuse,
  onShare,
  onDownload,
  variant = "interactive",
}: ActivityHistoryCardProps) {
  const statusLabel =
    ui.activityHistory.statuses[
      item.status as keyof typeof ui.activityHistory.statuses
    ] ?? item.status;

  const secretary =
    item.employees[0] ??
    item.services[0] ??
    "AI秘書";

  const actions = (
    <div
      className="mt-2.5 flex flex-wrap gap-1.5"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onReuse?.(item)}
        className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-[length:var(--text-meta)] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
      >
        <IconReuse className="h-3.5 w-3.5" />
        再利用
      </button>
      <button
        type="button"
        onClick={() => onShare?.(item)}
        className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-[length:var(--text-meta)] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
      >
        <IconShare className="h-3.5 w-3.5" />
        共有
      </button>
      <button
        type="button"
        onClick={() => onDownload?.(item)}
        className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-[length:var(--text-meta)] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
      >
        <IconDownload className="h-3.5 w-3.5" />
        ダウンロード
      </button>
    </div>
  );

  const content = (
    <>
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-muted)] text-base text-[var(--brand)]">
          {getCategoryIcon(item.category)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            {item.metadata.favorite ? (
              <span aria-hidden className="text-[var(--brand)]">
                ★
              </span>
            ) : null}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[length:var(--text-meta)] font-medium",
                STATUS_CLASS[item.status] ?? STATUS_CLASS.review,
              )}
            >
              {statusLabel}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[length:var(--text-meta)] text-[var(--text-muted)]">
            <span>{new Date(item.completedAt).toLocaleString("ja-JP")}</span>
            <span aria-hidden>·</span>
            <span>{formatDuration(item.durationMs)}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <IconUser className="h-3 w-3" />
              {secretary}
            </span>
          </div>
          {actions}
        </div>
      </div>
    </>
  );

  if (variant === "static") {
    return (
      <div className={cn(CARD_CLASS, "hover:border-[var(--border-strong)]")}>
        {content}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(item);
        }
      }}
      className={cn(
        CARD_CLASS,
        "cursor-pointer hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] active:scale-[0.995]",
        selected && "border-[var(--accent)] ring-2 ring-[var(--accent)]/20",
      )}
    >
      {content}
    </div>
  );
}
