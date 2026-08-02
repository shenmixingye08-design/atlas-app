import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { AutomationRun } from "@/lib/automation-platform/types/run";
import { buildFailureUserView } from "./failure-view";
import { describeNeedsInput } from "./needs-input";
import { formatRunStatus } from "./status-labels";

export type OperationsAttentionItem = {
  kind:
    | "awaiting_approval"
    | "needs_input"
    | "failed"
    | "partially_succeeded"
    | "running"
    | "paused_automation";
  title: string;
  subtitle: string;
  href: string;
  at: string | null;
  runId?: string;
  automationId?: string;
};

export type OperationsTodayItem = {
  timeLabel: string;
  title: string;
  statusLabel: string;
  href: string;
  sortAt: number;
  tone: "success" | "warning" | "danger" | "muted" | "info";
};

export type AutomationOperationsSummary = {
  counts: {
    activeAutomations: number;
    pausedAutomations: number;
    awaitingApproval: number;
    needsInput: number;
    running: number;
    succeededToday: number;
    failedToday: number;
  };
  nextRun: {
    automationId: string;
    name: string;
    nextRunAt: string;
    href: string;
  } | null;
  recentArtifacts: Array<{
    id: string;
    label: string;
    runId: string;
    automationName: string;
    createdAt: string;
    url: string | null;
    href: string;
  }>;
  attention: OperationsAttentionItem[];
  todayWork: OperationsTodayItem[];
  generatedAt: string;
};

function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function endOfLocalDay(now: Date): Date {
  const start = startOfLocalDay(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function toneForStatus(status: AutomationRun["status"]): OperationsTodayItem["tone"] {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  if (
    status === "awaiting_approval" ||
    status === "needs_input" ||
    status === "partially_succeeded"
  ) {
    return "warning";
  }
  if (status === "running" || status === "retrying" || status === "queued") {
    return "info";
  }
  return "muted";
}

function timeLabel(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function buildAutomationOperationsSummary(input: {
  automations: AutomationV2[];
  runs: AutomationRun[];
  now?: Date;
}): AutomationOperationsSummary {
  const now = input.now ?? new Date();
  const dayStart = startOfLocalDay(now).getTime();
  const dayEnd = endOfLocalDay(now).getTime();

  const activeAutomations = input.automations.filter(
    (item) => item.status === "active",
  ).length;
  const pausedAutomations = input.automations.filter(
    (item) => item.status === "paused",
  ).length;

  const awaitingApproval = input.runs.filter(
    (run) => run.status === "awaiting_approval",
  ).length;
  const needsInput = input.runs.filter(
    (run) => run.status === "needs_input" || run.needsUserInput,
  ).length;
  const running = input.runs.filter(
    (run) =>
      run.status === "running" ||
      run.status === "queued" ||
      run.status === "retrying" ||
      run.status === "preparing",
  ).length;

  const todayRuns = input.runs.filter((run) => {
    const t = Date.parse(run.completedAt ?? run.startedAt ?? run.createdAt);
    return Number.isFinite(t) && t >= dayStart && t < dayEnd;
  });
  const succeededToday = todayRuns.filter(
    (run) => run.status === "succeeded",
  ).length;
  const failedToday = todayRuns.filter(
    (run) =>
      run.status === "failed" || run.status === "partially_succeeded",
  ).length;

  const nextAutomation = [...input.automations]
    .filter((item) => item.status === "active" && item.nextRunAt)
    .sort(
      (a, b) =>
        Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!),
    )[0];

  const recentArtifacts = [...input.runs]
    .flatMap((run) =>
      run.artifacts.map((artifact) => ({
        id: artifact.id,
        label: artifact.label,
        runId: run.id,
        automationName: run.automationName,
        createdAt: artifact.createdAt,
        url: artifact.url,
        href: `/automations/runs/${encodeURIComponent(run.id)}#artifact-${encodeURIComponent(artifact.id)}`,
      })),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);

  const attention: OperationsAttentionItem[] = [];

  for (const run of input.runs) {
    if (run.status === "awaiting_approval") {
      attention.push({
        kind: "awaiting_approval",
        title: run.automationName,
        subtitle: "承認が必要です",
        href: `/automations/runs/${encodeURIComponent(run.id)}`,
        at: run.approvalExpiresAt ?? run.updatedAt,
        runId: run.id,
        automationId: run.automationId,
      });
    } else if (run.status === "needs_input" || run.needsUserInput) {
      attention.push({
        kind: "needs_input",
        title: run.automationName,
        subtitle: describeNeedsInput(run),
        href: `/automations/runs/${encodeURIComponent(run.id)}#needs-input`,
        at: run.updatedAt,
        runId: run.id,
        automationId: run.automationId,
      });
    } else if (
      run.status === "failed" ||
      run.status === "partially_succeeded"
    ) {
      const view = buildFailureUserView(run);
      attention.push({
        kind: run.status,
        title: run.automationName,
        subtitle: view.headline,
        href: `/automations/runs/${encodeURIComponent(run.id)}#failure`,
        at: run.completedAt ?? run.updatedAt,
        runId: run.id,
        automationId: run.automationId,
      });
    } else if (run.status === "running" || run.status === "retrying") {
      attention.push({
        kind: "running",
        title: run.automationName,
        subtitle: formatRunStatus(run.status),
        href: `/automations/runs/${encodeURIComponent(run.id)}`,
        at: run.updatedAt,
        runId: run.id,
        automationId: run.automationId,
      });
    }
  }

  for (const automation of input.automations) {
    if (automation.status === "paused") {
      attention.push({
        kind: "paused_automation",
        title: automation.name,
        subtitle: "一時停止中 — 再開するまでスケジュールは止まります",
        href: `/automations?v2=${encodeURIComponent(automation.id)}`,
        at: automation.updatedAt,
        automationId: automation.id,
      });
    }
  }

  attention.sort(
    (a, b) => Date.parse(b.at ?? "") - Date.parse(a.at ?? ""),
  );

  const todayWork: OperationsTodayItem[] = [];

  for (const run of todayRuns) {
    todayWork.push({
      timeLabel: timeLabel(
        run.completedAt ?? run.startedAt ?? run.scheduledFor,
        "--:--",
      ),
      title: run.automationName,
      statusLabel: formatRunStatus(run.status),
      href: `/automations/runs/${encodeURIComponent(run.id)}`,
      sortAt: Date.parse(
        run.completedAt ?? run.startedAt ?? run.scheduledFor ?? run.createdAt,
      ),
      tone: toneForStatus(run.status),
    });
  }

  for (const automation of input.automations) {
    if (automation.status !== "active" || !automation.nextRunAt) continue;
    const t = Date.parse(automation.nextRunAt);
    if (!Number.isFinite(t) || t < dayStart || t >= dayEnd) continue;
    const already = todayWork.some(
      (item) =>
        item.title === automation.name &&
        Math.abs(item.sortAt - t) < 60_000,
    );
    if (already) continue;
    todayWork.push({
      timeLabel: timeLabel(automation.nextRunAt, "--:--"),
      title: automation.name,
      statusLabel: "実行予定",
      href: `/automations?v2=${encodeURIComponent(automation.id)}`,
      sortAt: t,
      tone: "muted",
    });
  }

  for (const automation of input.automations) {
    if (automation.status !== "paused") continue;
    todayWork.push({
      timeLabel: "—",
      title: automation.name,
      statusLabel: "一時停止中",
      href: `/automations?v2=${encodeURIComponent(automation.id)}`,
      sortAt: Date.parse(automation.updatedAt),
      tone: "warning",
    });
  }

  todayWork.sort((a, b) => a.sortAt - b.sortAt);

  return {
    counts: {
      activeAutomations,
      pausedAutomations,
      awaitingApproval,
      needsInput,
      running,
      succeededToday,
      failedToday,
    },
    nextRun: nextAutomation?.nextRunAt
      ? {
          automationId: nextAutomation.id,
          name: nextAutomation.name,
          nextRunAt: nextAutomation.nextRunAt,
          href: `/automations?v2=${encodeURIComponent(nextAutomation.id)}`,
        }
      : null,
    recentArtifacts,
    attention: attention.slice(0, 20),
    todayWork,
    generatedAt: now.toISOString(),
  };
}
