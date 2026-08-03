import type { AutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import type { StepProgressItem } from "@/lib/automation-platform/operations/progress";
import { buildRunProgressView } from "@/lib/automation-platform/operations/progress";
import type { AutomationRun } from "@/lib/automation-platform/types";
import type { RunVisualStatus } from "@/lib/automation-first/status";
import type { HomeAttentionItem } from "@/lib/automation-first/home-model";

export type HomeTimelineRow = {
  id: string;
  timeLabel: string;
  title: string;
  status: RunVisualStatus;
  statusLabel?: string;
  currentStep?: string | null;
  nextAction?: string;
  artifactLabel?: string | null;
  href: string;
  tone: "success" | "warning" | "danger" | "muted" | "info";
};

export type HomeRunningJob = {
  id: string;
  title: string;
  href: string;
  currentStepName: string | null;
  steps: StepProgressItem[];
  updatedAt: string;
};

export type HomeWeeklyStats = {
  completedJobs: number;
  successRatePercent: number | null;
  artifactCount: number;
  autoStepCount: number;
  estimatedSkippedActions: number;
  /** Only set when a measured basis exists — otherwise omit from UI. */
  savedMinutes: number | null;
};

export type HomeNextRunView = {
  automationId: string;
  name: string;
  nextRunAt: string;
  href: string;
  policyLabel: string;
  approvalRequired: boolean;
};

function mapOpsToneToVisual(
  tone: HomeTimelineRow["tone"],
  statusLabel: string,
): RunVisualStatus {
  const label = statusLabel.toLowerCase();
  if (tone === "danger" || /失敗|failed/.test(label)) return "failed";
  if (/一部|partial/.test(label)) return "partial";
  if (tone === "warning" && /入力|needs/.test(label)) return "needs_input";
  if (tone === "warning" || /承認|確認|approval/.test(label)) {
    return "pending_approval";
  }
  if (tone === "info" || /実行中|running|queued|retry/.test(label)) {
    return "running";
  }
  if (tone === "success" || /完了|succeeded|success/.test(label)) {
    return "completed";
  }
  if (/停止|paused/.test(label)) return "paused";
  return "scheduled";
}

function nextActionForStatus(status: RunVisualStatus): string {
  switch (status) {
    case "pending_approval":
      return "確認する";
    case "needs_input":
      return "入力する";
    case "failed":
    case "partial":
      return "修復する";
    case "running":
      return "進捗を見る";
    case "completed":
      return "成果物";
    default:
      return "詳細";
  }
}

export function mapOpsAttentionToHomeItems(
  attention: AutomationOperationsSummary["attention"],
): HomeAttentionItem[] {
  return attention
    .filter((item) => item.kind !== "running")
    .map((item) => {
      let kind: HomeAttentionItem["kind"] = "failed";
      let actionLabel = "確認する";
      if (item.kind === "awaiting_approval") {
        kind = "approval";
        actionLabel = "確認する";
      } else if (item.kind === "needs_input") {
        kind = "input";
        actionLabel = "入力する";
      } else if (item.kind === "failed" || item.kind === "partially_succeeded") {
        kind = "failed";
        actionLabel = "修復する";
      } else if (item.kind === "paused_automation") {
        kind = "reconnect";
        actionLabel = "確認する";
      }

      return {
        id: `${item.kind}:${item.runId ?? item.automationId ?? item.title}`,
        kind,
        title: item.title,
        description: item.subtitle,
        href: item.href,
        actionLabel,
        meta: item.at,
      };
    });
}

export function mapOpsTodayWorkToTimeline(
  todayWork: AutomationOperationsSummary["todayWork"],
  runs: AutomationRun[] = [],
): HomeTimelineRow[] {
  const runByHref = new Map(
    runs.map((run) => [`/automations/runs/${encodeURIComponent(run.id)}`, run]),
  );

  return todayWork.map((item, index) => {
    const status = mapOpsToneToVisual(item.tone, item.statusLabel);
    const run = runByHref.get(item.href);
    const progress = run ? buildRunProgressView(run) : null;
    const artifact = run?.artifacts[0]?.label ?? null;

    return {
      id: `${item.href}:${index}`,
      timeLabel: item.timeLabel,
      title: item.title,
      status,
      statusLabel: item.statusLabel,
      currentStep: progress?.currentStepName ?? null,
      nextAction: nextActionForStatus(status),
      artifactLabel: artifact,
      href: item.href,
      tone: item.tone,
    };
  });
}

export function buildRunningJobsFromRuns(runs: AutomationRun[]): HomeRunningJob[] {
  return runs
    .filter(
      (run) =>
        run.status === "running" ||
        run.status === "queued" ||
        run.status === "retrying" ||
        run.status === "preparing",
    )
    .map((run) => {
      const progress = buildRunProgressView(run);
      return {
        id: run.id,
        title: run.automationName,
        href: `/automations/runs/${encodeURIComponent(run.id)}`,
        currentStepName: progress.currentStepName,
        steps: progress.items,
        updatedAt: run.updatedAt,
      };
    });
}

export function buildWeeklyStatsFromRuns(
  runs: AutomationRun[],
  now: Date = new Date(),
): HomeWeeklyStats {
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  const day = weekStart.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - mondayOffset);
  const weekStartMs = weekStart.getTime();

  const weekRuns = runs.filter((run) => {
    const t = Date.parse(run.completedAt ?? run.startedAt ?? run.createdAt);
    return Number.isFinite(t) && t >= weekStartMs;
  });

  const terminal = weekRuns.filter((run) =>
    ["succeeded", "failed", "partially_succeeded", "cancelled", "skipped"].includes(
      run.status,
    ),
  );
  const completedJobs = terminal.filter((run) => run.status === "succeeded").length;
  const successRatePercent =
    terminal.length === 0
      ? null
      : Math.round((completedJobs / terminal.length) * 100);

  const artifactCount = weekRuns.reduce(
    (sum, run) => sum + run.artifacts.length,
    0,
  );
  const autoStepCount = weekRuns.reduce(
    (sum, run) =>
      sum +
      run.steps.filter(
        (step) => step.status === "succeeded" || step.status === "skipped",
      ).length,
    0,
  );

  // Conservative proxy: each succeeded step that would otherwise need a click.
  const estimatedSkippedActions = autoStepCount;

  return {
    completedJobs,
    successRatePercent,
    artifactCount,
    autoStepCount,
    estimatedSkippedActions,
    // Measured ROI is hydrated on the client (see AutomationFirstHome).
    savedMinutes: null as number | null,
  };
}

export function formatNextRunDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}
