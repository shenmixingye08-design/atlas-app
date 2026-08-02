import type { AutomationRun } from "@/lib/automation-platform/types";
import { formatStepStatus } from "./status-labels";

export type StepProgressItem = {
  id: string;
  name: string;
  status: AutomationRun["steps"][number]["status"];
  statusLabel: string;
  marker: "done" | "active" | "waiting" | "failed" | "retrying";
};

export type RunProgressView = {
  currentStepName: string | null;
  nextStepName: string | null;
  completedCount: number;
  waitingCount: number;
  failedCount: number;
  retryingCount: number;
  awaitingApproval: boolean;
  needsInput: boolean;
  items: StepProgressItem[];
  /** Explicitly estimated — never claim precision. */
  estimatedRemainingLabel: string | null;
  lastUpdatedAt: string;
};

function markerFor(
  status: AutomationRun["steps"][number]["status"],
): StepProgressItem["marker"] {
  if (status === "succeeded" || status === "skipped") return "done";
  if (status === "running") return "active";
  if (status === "failed") return "failed";
  if (status === "retrying") return "retrying";
  return "waiting";
}

/**
 * Estimate remaining duration from preparation label or completed step pace.
 * Always qualifies as approximate.
 */
export function estimateRemainingLabel(run: AutomationRun): string | null {
  if (
    run.status === "succeeded" ||
    run.status === "failed" ||
    run.status === "partially_succeeded" ||
    run.status === "cancelled" ||
    run.status === "skipped" ||
    run.status === "expired"
  ) {
    return null;
  }

  const prep = run.preparation?.estimatedDurationLabel?.trim();
  if (prep) {
    return `推定残り時間（目安）: ${prep}`;
  }

  const completed = run.steps.filter(
    (step) => step.status === "succeeded" || step.status === "skipped",
  );
  const remaining = run.steps.filter(
    (step) =>
      step.status === "pending" ||
      step.status === "running" ||
      step.status === "retrying" ||
      step.status === "waiting_approval",
  ).length;

  if (completed.length === 0 || remaining === 0) {
    return "推定残り時間（目安）: まもなく完了、または数分";
  }

  const durations = completed
    .map((step) => {
      if (!step.startedAt || !step.completedAt) return null;
      return Date.parse(step.completedAt) - Date.parse(step.startedAt);
    })
    .filter((ms): ms is number => ms != null && ms > 0);

  if (durations.length === 0) {
    return `推定残り時間（目安）: 約${remaining}〜${remaining + 2}分`;
  }

  const avg =
    durations.reduce((sum, ms) => sum + ms, 0) / durations.length;
  const lowMin = Math.max(1, Math.round((avg * remaining) / 60000));
  const highMin = Math.max(lowMin + 1, Math.round(lowMin * 1.6));
  return `推定残り時間（目安）: 約${lowMin}〜${highMin}分`;
}

export function buildRunProgressView(run: AutomationRun): RunProgressView {
  const items = run.steps.map((step) => ({
    id: step.id,
    name: step.name,
    status: step.status,
    statusLabel: formatStepStatus(step.status),
    marker: markerFor(step.status),
  }));

  const current =
    run.steps.find((step) => step.status === "running") ??
    run.steps.find((step) => step.status === "retrying") ??
    run.steps.find((step) => step.status === "waiting_approval") ??
    null;

  const currentIndex = current
    ? run.steps.findIndex((step) => step.id === current.id)
    : -1;
  const next =
    currentIndex >= 0
      ? run.steps
          .slice(currentIndex + 1)
          .find((step) => step.status === "pending") ?? null
      : run.steps.find((step) => step.status === "pending") ?? null;

  return {
    currentStepName: current?.name ?? null,
    nextStepName: next?.name ?? null,
    completedCount: run.steps.filter(
      (step) => step.status === "succeeded" || step.status === "skipped",
    ).length,
    waitingCount: run.steps.filter((step) => step.status === "pending")
      .length,
    failedCount: run.steps.filter((step) => step.status === "failed").length,
    retryingCount: run.steps.filter((step) => step.status === "retrying")
      .length,
    awaitingApproval: run.status === "awaiting_approval",
    needsInput: run.status === "needs_input" || run.needsUserInput,
    items,
    estimatedRemainingLabel: estimateRemainingLabel(run),
    lastUpdatedAt: run.updatedAt,
  };
}
