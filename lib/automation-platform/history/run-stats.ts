import type { AutomationRun } from "@/lib/automation-platform/types/run";

export type RunHistoryStats = {
  runId: string;
  automationName: string;
  startedAt: string | null;
  endedAt: string | null;
  stepCount: number;
  succeededSteps: number;
  failedSteps: number;
  successRate: number;
  artifactCount: number;
  durationMs: number | null;
  durationLabel: string;
  status: AutomationRun["status"];
};

function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem === 0 ? `${min}分` : `${min}分${rem}秒`;
}

/** Per-run history row for list / dashboard. */
export function buildRunHistoryStats(run: AutomationRun): RunHistoryStats {
  const succeededSteps = run.steps.filter(
    (s) => s.status === "succeeded" || s.status === "skipped",
  ).length;
  const failedSteps = run.steps.filter((s) => s.status === "failed").length;
  const stepCount = run.steps.length;
  const successRate =
    stepCount === 0 ? 0 : Math.round((succeededSteps / stepCount) * 100);

  return {
    runId: run.id,
    automationName: run.automationName,
    startedAt: run.startedAt,
    endedAt: run.completedAt,
    stepCount,
    succeededSteps,
    failedSteps,
    successRate,
    artifactCount: run.artifacts.length,
    durationMs: run.durationMs,
    durationLabel: formatDuration(run.durationMs),
    status: run.status,
  };
}
