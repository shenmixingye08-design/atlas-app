import type { TodayJobStatus } from "./today-dashboard";

/** Shared today-dashboard status labels for list / detail / home / notify. */
export const TODAY_JOB_STATUS_LABELS: Record<TodayJobStatus, string> = {
  not_started: "未開始",
  preparing: "準備中",
  running: "実行中",
  awaiting_review: "承認待ち",
  completed: "完了",
  skipped: "スキップ",
};

export type TodayJobStatusStyle = {
  label: string;
  className: string;
};

const STATUS_STYLES: Record<TodayJobStatus, TodayJobStatusStyle> = {
  not_started: {
    label: TODAY_JOB_STATUS_LABELS.not_started,
    className:
      "bg-[var(--card)] text-[var(--foreground-muted)] ring-1 ring-[var(--border-subtle)]",
  },
  preparing: {
    label: TODAY_JOB_STATUS_LABELS.preparing,
    className: "bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20",
  },
  running: {
    label: TODAY_JOB_STATUS_LABELS.running,
    className:
      "bg-[var(--status-running)]/15 text-[var(--status-running)] ring-1 ring-[var(--status-running)]/25",
  },
  awaiting_review: {
    label: TODAY_JOB_STATUS_LABELS.awaiting_review,
    className: "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20",
  },
  completed: {
    label: TODAY_JOB_STATUS_LABELS.completed,
    className:
      "bg-[var(--status-success)]/15 text-[var(--status-success)] ring-1 ring-[var(--status-success)]/25",
  },
  skipped: {
    label: TODAY_JOB_STATUS_LABELS.skipped,
    className: "bg-[var(--background-subtle)] text-[var(--foreground-muted)]",
  },
};

export function getTodayJobStatusLabel(status: TodayJobStatus): string {
  return TODAY_JOB_STATUS_LABELS[status] ?? status;
}

export function getTodayJobStatusStyle(status: TodayJobStatus): TodayJobStatusStyle {
  return STATUS_STYLES[status] ?? STATUS_STYLES.not_started;
}
