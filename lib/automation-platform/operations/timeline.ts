import type { AutomationRun } from "@/lib/automation-platform/types";
import { formatRunStatus, formatStepStatus } from "./status-labels";

export type TimelineEntry = {
  id: string;
  at: string;
  timeLabel: string;
  title: string;
  detail: string | null;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    claim_and_start: "実行を開始",
    all_steps_succeeded: "すべての手順が完了",
    execution_failed: "実行が停止",
    retry_scheduled: "再試行を予約",
    step_needs_input: "入力待ちに移行",
    approved: "承認されました",
    rejected: "却下されました",
    cancelled_by_user: "キャンセルされました",
    approval_expired: "承認期限切れ",
  };
  return map[reason] ?? reason;
}

/**
 * Build a user-readable chronological timeline from statusHistory + steps.
 * External integration steps are labeled with completion / in-progress status.
 * Does not include secrets, tokens, or full file bodies.
 */
export function buildRunTimeline(run: AutomationRun): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const transition of run.statusHistory) {
    entries.push({
      id: `status-${transition.timestamp}-${transition.nextStatus}`,
      at: transition.timestamp,
      timeLabel: timeLabel(transition.timestamp),
      title: formatRunStatus(transition.nextStatus),
      detail: reasonLabel(transition.reason),
      tone:
        transition.nextStatus === "failed"
          ? "danger"
          : transition.nextStatus === "succeeded"
            ? "success"
            : transition.nextStatus === "partially_succeeded" ||
                transition.nextStatus === "awaiting_approval" ||
                transition.nextStatus === "needs_input"
              ? "warning"
              : "info",
    });
  }

  for (const step of run.steps) {
    const isExternal = [
      "gmail",
      "x_post",
      "dropbox",
      "google_calendar",
      "wordpress",
    ].includes(step.capabilityId ?? "");

    if (step.status === "running" || step.status === "pending") {
      entries.push({
        id: `step-progress-${step.id}`,
        at: step.startedAt ?? run.updatedAt ?? run.createdAt,
        timeLabel: timeLabel(step.startedAt ?? run.updatedAt ?? run.createdAt),
        title: isExternal
          ? `${step.name}（外部処理）${step.status === "running" ? "実行中" : "待機"}`
          : `${step.name}${step.status === "running" ? "を実行中" : "待機"}`,
        detail: step.outputSummary?.slice(0, 160) ?? null,
        tone: "info",
      });
    }

    if (step.startedAt && step.status !== "running" && step.status !== "pending") {
      entries.push({
        id: `step-start-${step.id}`,
        at: step.startedAt,
        timeLabel: timeLabel(step.startedAt),
        title: `${step.name}を開始`,
        detail: null,
        tone: "info",
      });
    }
    if (step.completedAt) {
      const ok = step.status === "succeeded" || step.status === "skipped";
      entries.push({
        id: `step-end-${step.id}`,
        at: step.completedAt,
        timeLabel: timeLabel(step.completedAt),
        title: ok
          ? `${step.name}${step.status === "skipped" ? "をスキップ" : "完了"}`
          : `${step.name}が${formatStepStatus(step.status)}`,
        detail: step.errorMessage
          ? step.errorMessage.slice(0, 160)
          : step.outputSummary
            ? step.outputSummary.slice(0, 160)
            : null,
        tone: ok ? "success" : step.status === "failed" ? "danger" : "warning",
      });
    }
    if (step.attemptCount > 1 && step.startedAt) {
      entries.push({
        id: `step-retry-${step.id}-${step.attemptCount}`,
        at: step.startedAt,
        timeLabel: timeLabel(step.startedAt),
        title: `${step.name}の${step.attemptCount}回目の再試行`,
        detail: null,
        tone: "warning",
      });
    }
  }

  for (const artifact of run.artifacts) {
    entries.push({
      id: `artifact-${artifact.id}`,
      at: artifact.createdAt,
      timeLabel: timeLabel(artifact.createdAt),
      title:
        artifact.kind === "external"
          ? `外部処理「${artifact.label}」完了`
          : `成果物「${artifact.label}」を作成`,
      detail: artifact.externalId
        ? `外部ID: ${artifact.externalId}`
        : null,
      tone: "success",
    });
  }

  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
