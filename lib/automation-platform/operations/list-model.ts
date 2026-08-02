import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { AutomationRun } from "@/lib/automation-platform/types/run";
import { AUTOMATION_STATUS_LABEL } from "./status-labels";

export type AutomationListFilter =
  | "all"
  | "active"
  | "paused"
  | "awaiting_approval"
  | "needs_input"
  | "has_failure"
  | "runs_today"
  | "runs_this_week"
  | "archived";

export type AutomationListSort =
  | "next_run"
  | "updated"
  | "success_rate"
  | "name"
  | "last_run";

export type AutomationListRow = {
  automation: AutomationV2;
  successRate: number | null;
  recentFailure: boolean;
  lastResultLabel: string;
  awaitingApproval: boolean;
  needsInput: boolean;
  memorySummary: string;
  stepSummary: string;
};

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function buildAutomationListRows(
  automations: AutomationV2[],
  runs: AutomationRun[],
): AutomationListRow[] {
  const byAutomation = new Map<string, AutomationRun[]>();
  for (const run of runs) {
    const list = byAutomation.get(run.automationId) ?? [];
    list.push(run);
    byAutomation.set(run.automationId, list);
  }

  return automations.map((automation) => {
    const related = (byAutomation.get(automation.id) ?? []).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    const terminal = related.filter((run) =>
      ["succeeded", "partially_succeeded", "failed", "cancelled", "skipped"].includes(
        run.status,
      ),
    );
    const succeeded = terminal.filter((run) => run.status === "succeeded").length;
    const successRate =
      terminal.length > 0
        ? Math.round((succeeded / terminal.length) * 100)
        : null;
    const last = related[0];
    const recentFailure = related
      .slice(0, 5)
      .some(
        (run) =>
          run.status === "failed" || run.status === "partially_succeeded",
      );

    return {
      automation,
      successRate,
      recentFailure,
      lastResultLabel: last
        ? last.status === "succeeded"
          ? "成功"
          : last.status === "partially_succeeded"
            ? "一部成功"
            : last.status === "failed"
              ? "失敗"
              : last.status === "awaiting_approval"
                ? "承認待ち"
                : last.status === "needs_input"
                  ? "入力待ち"
                  : AUTOMATION_STATUS_LABEL[automation.status]
        : "未実行",
      awaitingApproval: related.some((run) => run.status === "awaiting_approval"),
      needsInput: related.some(
        (run) => run.status === "needs_input" || run.needsUserInput,
      ),
      memorySummary: automation.memoryPolicy.enabled
        ? `記憶利用: ${automation.memoryPolicy.allowedScopes.slice(0, 3).join("・") || "有効"}`
        : "記憶未使用",
      stepSummary: automation.workflow.steps
        .filter((step) => step.enabled)
        .map((step) => step.name)
        .slice(0, 4)
        .join(" → "),
    };
  });
}

export function filterAutomationListRows(
  rows: AutomationListRow[],
  filter: AutomationListFilter,
  query: string,
  now: Date = new Date(),
): AutomationListRow[] {
  const q = query.trim().toLowerCase();
  const dayStart = startOfDay(now);
  const weekStart = dayStart - now.getDay() * 24 * 60 * 60 * 1000;

  return rows.filter((row) => {
    const a = row.automation;
    if (q) {
      const haystack = [
        a.name,
        a.description,
        row.stepSummary,
        row.memorySummary,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    switch (filter) {
      case "active":
        return a.status === "active";
      case "paused":
        return a.status === "paused";
      case "awaiting_approval":
        return row.awaitingApproval;
      case "needs_input":
        return row.needsInput;
      case "has_failure":
        return row.recentFailure;
      case "runs_today": {
        const t = a.lastRunAt ? Date.parse(a.lastRunAt) : NaN;
        return Number.isFinite(t) && t >= dayStart;
      }
      case "runs_this_week": {
        const t = a.lastRunAt ? Date.parse(a.lastRunAt) : NaN;
        return Number.isFinite(t) && t >= weekStart;
      }
      case "archived":
        return a.status === "archived";
      case "all":
      default:
        return a.status !== "archived";
    }
  });
}

export function sortAutomationListRows(
  rows: AutomationListRow[],
  sort: AutomationListSort,
): AutomationListRow[] {
  const copy = [...rows];
  switch (sort) {
    case "name":
      return copy.sort((a, b) =>
        a.automation.name.localeCompare(b.automation.name, "ja"),
      );
    case "updated":
      return copy.sort(
        (a, b) =>
          Date.parse(b.automation.updatedAt) -
          Date.parse(a.automation.updatedAt),
      );
    case "last_run":
      return copy.sort(
        (a, b) =>
          Date.parse(b.automation.lastRunAt ?? 0) -
          Date.parse(a.automation.lastRunAt ?? 0),
      );
    case "success_rate":
      return copy.sort(
        (a, b) => (b.successRate ?? -1) - (a.successRate ?? -1),
      );
    case "next_run":
    default:
      return copy.sort((a, b) => {
        const aT = a.automation.nextRunAt
          ? Date.parse(a.automation.nextRunAt)
          : Number.POSITIVE_INFINITY;
        const bT = b.automation.nextRunAt
          ? Date.parse(b.automation.nextRunAt)
          : Number.POSITIVE_INFINITY;
        return aT - bT;
      });
  }
}
