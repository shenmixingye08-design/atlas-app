import type { AutomationRun } from "@/lib/automation-platform/types";
import type {
  MetricsComparison,
  WorkflowMetricsSnapshot,
} from "@/lib/workflow-learning/types";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? null;
}

export function computeMetricsFromRuns(
  runs: AutomationRun[],
  manualCorrectionCount = 0,
): WorkflowMetricsSnapshot {
  const runCount = runs.length;
  if (runCount === 0) {
    return {
      runCount: 0,
      successRate: 0,
      stepSuccessRate: 0,
      avgDurationMs: null,
      p95DurationMs: null,
      retryRate: 0,
      timeoutRate: 0,
      manualCorrectionCount,
      approvalCount: 0,
      needsInputRate: 0,
      tokenEstimateTotal: 0,
      aiCallEstimate: 0,
      estimatedCostUnits: 0,
      reeditRate: 0,
    };
  }

  const succeeded = runs.filter((r) => r.status === "succeeded").length;
  const durations = runs
    .map((r) => r.durationMs)
    .filter((d): d is number => typeof d === "number" && d >= 0)
    .sort((a, b) => a - b);
  const avgDurationMs =
    durations.length > 0
      ? durations.reduce((s, d) => s + d, 0) / durations.length
      : null;

  let stepTotal = 0;
  let stepOk = 0;
  let aiCalls = 0;
  for (const run of runs) {
    for (const step of run.steps) {
      stepTotal += 1;
      if (step.status === "succeeded" || step.status === "skipped") stepOk += 1;
      if (
        step.capabilityId === "orchestrate" ||
        step.capabilityId === "vision_analysis" ||
        step.capabilityId === "deliverable_generate"
      ) {
        aiCalls += step.attemptCount || 1;
      }
    }
  }

  const retryRate =
    runs.filter((r) => r.attemptCount > 1).length / runCount;
  const timeoutRate =
    runs.filter((r) => (r.lastErrorCode ?? "").includes("timeout")).length /
    runCount;
  const approvalCount = runs.filter(
    (r) => r.approval?.status === "approved" || r.approval?.status === "pending",
  ).length;
  const needsInputRate =
    runs.filter((r) => r.needsUserInput).length / runCount;
  const tokenEstimateTotal = runs.reduce(
    (s, r) => s + (r.memoryUsage?.tokenEstimate ?? 0),
    0,
  );
  const estimatedCostUnits = tokenEstimateTotal / 1000 + aiCalls * 0.5;
  const reeditRate = manualCorrectionCount / runCount;

  return {
    runCount,
    successRate: succeeded / runCount,
    stepSuccessRate: stepTotal > 0 ? stepOk / stepTotal : 0,
    avgDurationMs,
    p95DurationMs: percentile(durations, 95),
    retryRate,
    timeoutRate,
    manualCorrectionCount,
    approvalCount,
    needsInputRate,
    tokenEstimateTotal,
    aiCallEstimate: aiCalls,
    estimatedCostUnits,
    reeditRate,
  };
}

export function compareMetrics(
  before: WorkflowMetricsSnapshot,
  after: WorkflowMetricsSnapshot,
): MetricsComparison {
  const durationDelta =
    before.avgDurationMs != null && after.avgDurationMs != null
      ? after.avgDurationMs - before.avgDurationMs
      : null;

  const deltas = {
    successRate: after.successRate - before.successRate,
    avgDurationMs: durationDelta,
    retryRate: after.retryRate - before.retryRate,
    estimatedCostUnits: after.estimatedCostUnits - before.estimatedCostUnits,
    manualCorrectionCount:
      after.manualCorrectionCount - before.manualCorrectionCount,
    approvalCount: after.approvalCount - before.approvalCount,
  };

  const improved =
    deltas.successRate >= 0 &&
    (deltas.avgDurationMs == null || deltas.avgDurationMs <= 0) &&
    deltas.retryRate <= 0.05 &&
    deltas.estimatedCostUnits <= 0.05;

  const parts: string[] = [];
  parts.push(
    `成功率 ${(before.successRate * 100).toFixed(0)}% → ${(after.successRate * 100).toFixed(0)}%`,
  );
  if (before.avgDurationMs != null && after.avgDurationMs != null) {
    parts.push(
      `平均時間 ${Math.round(before.avgDurationMs / 1000)}秒 → ${Math.round(after.avgDurationMs / 1000)}秒`,
    );
  }
  parts.push(
    `推定コスト ${before.estimatedCostUnits.toFixed(1)} → ${after.estimatedCostUnits.toFixed(1)}`,
  );

  return {
    before,
    after,
    deltas,
    improved,
    summary: parts.join(" / "),
  };
}
