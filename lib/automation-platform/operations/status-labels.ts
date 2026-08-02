import type { AutomationRunStatus } from "@/lib/automation-platform/types/status";
import type { RunStepStatus } from "@/lib/automation-platform/types/run";
import type { AutomationDefinitionStatus } from "@/lib/automation-platform/types/status";

/** User-facing Japanese labels — never expose raw English statuses in UI. */
export const RUN_STATUS_LABEL: Record<AutomationRunStatus, string> = {
  scheduled: "実行予定",
  preparing: "準備中",
  awaiting_approval: "承認待ち",
  queued: "実行待ち",
  running: "実行中",
  retrying: "再試行中",
  needs_input: "入力待ち",
  succeeded: "完了",
  partially_succeeded: "一部完了",
  failed: "失敗",
  skipped: "スキップ",
  cancelled: "キャンセル",
  expired: "期限切れ",
};

export const STEP_STATUS_LABEL: Record<RunStepStatus, string> = {
  pending: "待機",
  running: "実行中",
  waiting_approval: "承認待ち",
  succeeded: "完了",
  failed: "失敗",
  skipped: "スキップ",
  retrying: "再試行中",
};

export const AUTOMATION_STATUS_LABEL: Record<
  AutomationDefinitionStatus,
  string
> = {
  draft: "下書き",
  active: "稼働中",
  paused: "一時停止",
  disabled: "無効",
  archived: "保管済み",
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
