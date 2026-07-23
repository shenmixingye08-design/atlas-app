import type { Automation, AutomationRunHistoryEntry, AutomationStatus } from "./types";

/**
 * User-facing execution lifecycle for recurring work.
 * Maps onto durable AutomationStatus plus display-only waiting.
 */
export type AutomationExecutionState =
  | "waiting"
  | "running"
  | "completed"
  | "failed"
  | "retrying";

export const AUTOMATION_EXECUTION_STATE_LABELS: Record<
  AutomationExecutionState,
  string
> = {
  waiting: "待機中",
  running: "実行中",
  completed: "完了",
  failed: "失敗",
  retrying: "リトライ中",
};

/** Map durable status → execution state shown in UI. */
export function resolveAutomationExecutionState(
  automation: Pick<Automation, "enabled" | "status">,
): AutomationExecutionState {
  if (!automation.enabled && automation.status !== "running" && automation.status !== "retrying") {
    return "waiting";
  }
  switch (automation.status) {
    case "running":
      return "running";
    case "retrying":
      return "retrying";
    case "success":
      return "completed";
    case "failed":
      return "failed";
    case "idle":
    default:
      return "waiting";
  }
}

export function formatDurationMs(durationMs: number | null | undefined): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) {
    return "—";
  }
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}秒`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${minutes}分${rem}秒`;
}

export function describeLastRunResult(
  automation: Pick<Automation, "status" | "lastError" | "runHistory" | "lastResultSummary">,
): string {
  if (automation.lastResultSummary?.trim()) {
    return automation.lastResultSummary.trim();
  }
  const latest = automation.runHistory?.[0];
  if (!latest) {
    if (automation.status === "idle") return "まだ実行されていません";
    if (automation.status === "failed") {
      return automation.lastError?.trim() || "失敗しました";
    }
    if (automation.status === "success") return "完了しました";
    return "—";
  }
  if (latest.status === "completed") {
    const artifact =
      latest.artifacts?.tweetUrl ??
      latest.deliverablePreview ??
      null;
    if (artifact) {
      return artifact.length > 80 ? `${artifact.slice(0, 80)}…` : artifact;
    }
    return "完了しました";
  }
  return latest.error?.trim() || "失敗しました";
}

export function isActiveExecutionStatus(status: AutomationStatus): boolean {
  return status === "running" || status === "retrying";
}

export function summarizeRunHistoryEntry(entry: AutomationRunHistoryEntry): string {
  const duration = formatDurationMs(entry.durationMs);
  if (entry.status === "completed") {
    const url = entry.artifacts?.tweetUrl;
    if (url) return `完了（${duration}）· ${url}`;
    return `完了（${duration}）`;
  }
  if (entry.status === "retrying") {
    return `リトライ中 · 試行${entry.attempt ?? 1}`;
  }
  return `失敗（${duration}）· ${entry.error?.trim() || "エラー"}`;
}
