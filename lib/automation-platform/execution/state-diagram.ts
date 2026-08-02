/**
 * User-facing Run/Step state maps for Execution Engine docs & UI.
 * Internal enums stay snake_case; presentation aliases map sprint vocabulary.
 */

import type { AutomationRunStatus } from "@/lib/automation-platform/types/status";
import type { RunStepStatus } from "@/lib/automation-platform/types/run";

/** Sprint vocabulary → internal run status (many-to-one where needed). */
export const SPRINT_RUN_STATE_MAP = {
  Draft: "definition:draft" as const,
  Waiting: "queued" as const satisfies AutomationRunStatus,
  Scheduled: "scheduled" as const satisfies AutomationRunStatus,
  Running: "running" as const satisfies AutomationRunStatus,
  "Waiting Approval": "awaiting_approval" as const satisfies AutomationRunStatus,
  "Waiting Input": "needs_input" as const satisfies AutomationRunStatus,
  Retry: "retrying" as const satisfies AutomationRunStatus,
  Completed: "succeeded" as const satisfies AutomationRunStatus,
  "Partially Completed":
    "partially_succeeded" as const satisfies AutomationRunStatus,
  Failed: "failed" as const satisfies AutomationRunStatus,
  Cancelled: "cancelled" as const satisfies AutomationRunStatus,
} as const;

export const RUN_STATE_FLOW: ReadonlyArray<{
  from: AutomationRunStatus | "definition:draft";
  to: AutomationRunStatus;
  when: string;
}> = [
  { from: "definition:draft", to: "scheduled", when: "作成・有効化後に次回実行が決まる" },
  { from: "scheduled", to: "preparing", when: "発生キーで Run を作成" },
  { from: "preparing", to: "awaiting_approval", when: "承認が必要" },
  { from: "preparing", to: "queued", when: "承認不要" },
  { from: "awaiting_approval", to: "queued", when: "承認" },
  { from: "awaiting_approval", to: "cancelled", when: "却下" },
  { from: "awaiting_approval", to: "expired", when: "承認期限切れ" },
  { from: "queued", to: "running", when: "Worker が claim" },
  { from: "running", to: "needs_input", when: "追加入力 / 手順承認が必要" },
  { from: "needs_input", to: "queued", when: "入力後に再開" },
  { from: "running", to: "retrying", when: "一時失敗で自動 Retry" },
  { from: "retrying", to: "running", when: "Retry 時刻到来で再 claim" },
  { from: "running", to: "succeeded", when: "全 Step 成功" },
  { from: "running", to: "partially_succeeded", when: "一部成功・恒久失敗" },
  { from: "running", to: "failed", when: "全失敗・恒久失敗" },
  { from: "queued", to: "cancelled", when: "ユーザー取消" },
  { from: "running", to: "cancelled", when: "ユーザー取消" },
  { from: "awaiting_approval", to: "cancelled", when: "ユーザー取消" },
  { from: "retrying", to: "cancelled", when: "ユーザー取消" },
];

export const STEP_STATE_FLOW: ReadonlyArray<{
  from: RunStepStatus;
  to: RunStepStatus;
  when: string;
}> = [
  { from: "pending", to: "running", when: "Step 開始" },
  { from: "running", to: "succeeded", when: "Step 成功・成果物保存" },
  { from: "running", to: "failed", when: "恒久失敗 / 最大 Retry 超過" },
  { from: "running", to: "retrying", when: "一時失敗（429/503/timeout）" },
  { from: "retrying", to: "running", when: "Step 再試行" },
  { from: "running", to: "waiting_approval", when: "承認または入力待ち" },
  { from: "waiting_approval", to: "running", when: "承認/入力後に再開" },
  { from: "pending", to: "skipped", when: "無効 / 既に成功済みの再実行" },
];

export function formatSprintRunAlias(status: AutomationRunStatus): string {
  switch (status) {
    case "queued":
    case "preparing":
      return "Waiting";
    case "scheduled":
      return "Scheduled";
    case "running":
      return "Running";
    case "awaiting_approval":
      return "Waiting Approval";
    case "needs_input":
      return "Waiting Input";
    case "retrying":
      return "Retry";
    case "succeeded":
      return "Completed";
    case "partially_succeeded":
      return "Partially Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "skipped":
      return "Skipped";
    default:
      return status;
  }
}
