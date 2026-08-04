export type AttentionKind =
  | "approval"
  | "needs_input"
  | "reconnect"
  | "failed"
  | "billing";

export type RunVisualStatus =
  | "scheduled"
  | "running"
  | "pending_approval"
  | "needs_input"
  | "completed"
  | "partial"
  | "failed"
  | "paused"
  | "skipped";

export const RUN_STATUS_LABEL: Record<RunVisualStatus, string> = {
  scheduled: "予定",
  running: "実行中",
  pending_approval: "確認待ち",
  needs_input: "入力待ち",
  completed: "完了",
  partial: "一部完了",
  failed: "失敗",
  paused: "一時停止",
  skipped: "スキップ",
};

export function statusBadgeClass(status: RunVisualStatus): string {
  switch (status) {
    case "running":
      return "bg-[var(--status-running-bg)] text-[var(--status-running)]";
    case "pending_approval":
      return "bg-[var(--status-pending-approval-bg)] text-[var(--status-pending-approval)]";
    case "needs_input":
      return "bg-[var(--status-needs-input-bg)] text-[var(--status-needs-input)]";
    case "completed":
      return "bg-[var(--status-completed-bg)] text-[var(--status-completed)]";
    case "partial":
      return "bg-[var(--status-warning-bg)] text-[var(--status-warning)]";
    case "failed":
      return "bg-[var(--status-failed-bg)] text-[var(--status-failed)]";
    case "paused":
      return "bg-[var(--status-paused-bg)] text-[var(--status-paused)]";
    case "skipped":
      return "bg-[var(--status-neutral-bg)] text-[var(--status-neutral)]";
    default:
      return "bg-[var(--surface-muted)] text-[var(--text-secondary)]";
  }
}

export function mapTodayJobToVisual(
  status: string,
): RunVisualStatus {
  switch (status) {
    case "running":
    case "preparing":
      return "running";
    case "awaiting_review":
      return "pending_approval";
    case "completed":
      return "completed";
    case "skipped":
      return "skipped";
    default:
      return "scheduled";
  }
}
