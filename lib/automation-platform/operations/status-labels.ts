import type { AutomationRunStatus } from "@/lib/automation-platform/types/status";
import type { RunStepStatus } from "@/lib/automation-platform/types/run";
import type { AutomationDefinitionStatus } from "@/lib/automation-platform/types/status";

/** User-facing Japanese labels — never expose raw English statuses in UI. */
export const RUN_STATUS_LABEL: Record<AutomationRunStatus, string> = {
  scheduled: "実行予定",
  preparing: "準備済みです",
  awaiting_approval: "確認待ちです",
  queued: "実行待ち",
  running: "実行中",
  retrying: "再試行中",
  needs_input: "入力待ちです",
  succeeded: "仕事が完了しました",
  partially_succeeded: "一部完了しました。確認が必要です",
  failed: "完了できませんでした",
  skipped: "スキップ",
  cancelled: "キャンセル",
  expired: "期限切れ",
};

export const STEP_STATUS_LABEL: Record<RunStepStatus, string> = {
  pending: "待機",
  running: "実行中",
  waiting_approval: "確認待ちです",
  succeeded: "完了",
  failed: "失敗",
  skipped: "スキップ",
  retrying: "再試行中",
};

/** N-08: same user-facing vocabulary as canonical Automation statuses. */
export const AUTOMATION_STATUS_LABEL: Record<
  AutomationDefinitionStatus,
  string
> = {
  draft: "下書き",
  active: "有効",
  paused: "一時停止",
  disabled: "一時停止",
  archived: "削除済み",
};

export const TRIGGER_LABEL: Record<
  "manual" | "schedule" | "event" | "condition" | "retry",
  string
> = {
  manual: "手動",
  schedule: "スケジュール",
  event: "イベント",
  condition: "条件",
  retry: "再実行",
};

export function formatRunStatus(status: AutomationRunStatus): string {
  return RUN_STATUS_LABEL[status];
}

export function formatStepStatus(status: RunStepStatus): string {
  return STEP_STATUS_LABEL[status];
}

export type RunHeadlineInput = {
  status: AutomationRunStatus;
  triggerType: "manual" | "schedule" | "event" | "condition" | "retry";
  approval?: { mode?: string | null; status?: string | null } | null;
  preparation?: { approvalReason?: string | null } | null;
};

export function isUnattendedAutoRun(run: RunHeadlineInput): boolean {
  if (run.approval?.status === "not_required") return true;
  if (
    run.approval?.mode === "run_then_notify" &&
    !run.preparation?.approvalReason
  ) {
    return true;
  }
  return false;
}

/**
 * Header line that matches the actual execution mode.
 * Auto-exec never shows 「確認待ち・手動」.
 */
export function formatRunHeadline(run: RunHeadlineInput): string {
  if (isUnattendedAutoRun(run)) {
    switch (run.status) {
      case "scheduled":
        return "自動実行 · 実行予定";
      case "preparing":
      case "queued":
      case "running":
      case "retrying":
        return "実行中 · 自動実行";
      case "succeeded":
        return "完了 · 自動実行";
      case "awaiting_approval":
        return "実行中 · 自動実行";
      case "needs_input":
        return "入力待ちです";
      case "failed":
        return `${formatRunStatus("failed")} · 自動実行`;
      case "partially_succeeded":
        return `${formatRunStatus("partially_succeeded")} · 自動実行`;
      case "cancelled":
      case "expired":
      case "skipped":
        return formatRunStatus(run.status);
      default:
        return `${formatRunStatus(run.status)} · 自動実行`;
    }
  }

  if (
    run.status === "preparing" ||
    run.status === "queued" ||
    run.status === "running" ||
    run.status === "retrying"
  ) {
    return run.status === "preparing" ? "実行中" : formatRunStatus(run.status);
  }

  return `${formatRunStatus(run.status)} · ${TRIGGER_LABEL[run.triggerType]}`;
}
