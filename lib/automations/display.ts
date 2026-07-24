import {
  getEnabledStepLabels,
  normalizeExecutionFlow,
} from "./execution-flow";
import { getExecutionLevelLabel } from "./execution-level";
import { isExternalIntegration, getStepDefinition } from "./workflow-templates";
import type {
  Automation,
  AutomationExecutionLevel,
  AutomationSchedule,
  WorkExecutionFlow,
} from "./types";

/** User-facing job status for the entrusted-work screen. */
export type EntrustedJobStatus =
  | "scheduled"
  | "running"
  | "needs_review"
  | "completed"
  | "paused"
  | "error";

export const ENTRUSTED_JOB_STATUS_LABELS: Record<EntrustedJobStatus, string> = {
  scheduled: "実行予定",
  running: "処理中",
  needs_review: "確認待ち",
  completed: "完了",
  paused: "停止中",
  error: "エラー",
};

/** Confirmation scope mapped onto existing executionLevel values. */
export const CONFIRMATION_SCOPE_OPTIONS: {
  level: AutomationExecutionLevel;
  label: string;
  hint: string;
}[] = [
  {
    level: "suggest_only",
    label: "作成前に確認",
    hint: "内容を作る前に、方針を確認します",
  },
  {
    level: "draft_save",
    label: "下書きのみ作成",
    hint: "投稿文の下書きだけ作成し、自動投稿しません",
  },
  {
    level: "approve_then_run",
    label: "投稿前に確認",
    hint: "投稿文を用意したあと、投稿前に必ず確認します",
  },
  {
    level: "full_auto",
    label: "完全自動投稿",
    hint: "指定時刻に生成し、確認なしでXへ投稿します",
  },
];

export function getConfirmationScopeLabel(
  level: AutomationExecutionLevel,
): string {
  return (
    CONFIRMATION_SCOPE_OPTIONS.find((option) => option.level === level)?.label ??
    getExecutionLevelLabel(level)
  );
}

export function resolveEntrustedJobStatus(
  automation: Automation,
): EntrustedJobStatus {
  if (!automation.enabled) return "paused";
  if (automation.status === "running") return "running";
  if (automation.status === "failed") return "error";
  if (automation.status === "success") return "completed";
  return "scheduled";
}

export type EntrustedJobSummary = {
  scheduled: number;
  needsReview: number;
  completed: number;
  paused: number;
};

export function summarizeEntrustedJobs(
  automations: Automation[],
): EntrustedJobSummary {
  const summary: EntrustedJobSummary = {
    scheduled: 0,
    needsReview: 0,
    completed: 0,
    paused: 0,
  };

  for (const automation of automations) {
    const status = resolveEntrustedJobStatus(automation);
    if (status === "scheduled") summary.scheduled += 1;
    if (status === "completed") summary.completed += 1;
    if (status === "paused") summary.paused += 1;
    // needs_review is not stored as a dedicated status yet.
  }

  return summary;
}

export type ScheduleMethodKind =
  | "manual"
  | "daily"
  | "weekly"
  | "monthly"
  | "datetime"
  | "unsupported";

export function resolveScheduleMethod(
  schedule: AutomationSchedule,
): {
  kind: ScheduleMethodKind;
  label: string;
  supported: boolean;
} {
  if (schedule.kind !== "schedule") {
    return {
      kind: "unsupported",
      label: "順次対応",
      supported: false,
    };
  }

  switch (schedule.preset.type) {
    case "daily":
      return { kind: "daily", label: schedule.label || "毎日", supported: true };
    case "weekly":
      return { kind: "weekly", label: schedule.label || "毎週", supported: true };
    case "monthly":
      return {
        kind: "monthly",
        label: schedule.label || "毎月",
        supported: true,
      };
    default:
      return { kind: "unsupported", label: "順次対応", supported: false };
  }
}

export function flowHasCriticalExternalActions(
  flow: WorkExecutionFlow,
): boolean {
  const normalized = normalizeExecutionFlow(flow);
  return normalized.steps.some((step) => {
    if (!step.enabled) return false;
    const definition = getStepDefinition(normalized.templateId, step.id);
    if (!definition) return false;
    return isExternalIntegration(definition.integration);
  });
}

/**
 * Clamp confirmation level for unsafe defaults.
 *
 * X destination + explicit「完全自動投稿」(full_auto) must NOT be forced into
 * approve_then_run — that was the root cause of recurring X posts never
 * publishing. Other critical externals still default to confirmation.
 */
export function clampConfirmationLevel(
  level: AutomationExecutionLevel,
  flow: WorkExecutionFlow,
  options?: { destination?: "none" | "x"; allowFullAutoExternal?: boolean },
): AutomationExecutionLevel {
  if (level !== "full_auto") return level;
  if (options?.allowFullAutoExternal) return level;
  if (options?.destination === "x") return level;
  const normalized = normalizeExecutionFlow(flow);
  if (
    normalized.templateId === "sns_post" &&
    normalized.steps.some((step) => step.id === "publish" && step.enabled)
  ) {
    return level;
  }
  if (flowHasCriticalExternalActions(flow)) return "approve_then_run";
  return level;
}

export function describeMaterialsAndMemory(automation: Automation): string {
  const steps = getEnabledStepLabels(automation.executionFlow);
  const parts: string[] = [];

  if (steps.length > 0) {
    parts.push(steps.slice(0, 3).join("、"));
  }

  const assignment = automation.workflow.assignment.trim();
  if (assignment) {
    parts.push(
      assignment.length > 48 ? `${assignment.slice(0, 48)}…` : assignment,
    );
  }

  return parts.length > 0 ? parts.join(" / ") : "仕事の記憶を参照（設定時）";
}

export function describeProcedure(automation: Automation): string[] {
  const steps = getEnabledStepLabels(automation.executionFlow);
  if (steps.length > 0) return steps;
  return ["依頼内容を整理", "AI秘書が作業を実行", "結果を確認"];
}

/** Success rate 0–1 from durable counters. */
export function getAutomationSuccessRate(automation: Automation): number {
  const success = Math.max(0, automation.successCount ?? 0);
  const failure = Math.max(0, automation.failureCount ?? 0);
  const total = success + failure;
  if (total === 0) return 0;
  return success / total;
}

export function formatAutomationSuccessRate(automation: Automation): string {
  const success = Math.max(0, automation.successCount ?? 0);
  const failure = Math.max(0, automation.failureCount ?? 0);
  const total = success + failure;
  if (total === 0) return "—";
  return `${Math.round(getAutomationSuccessRate(automation) * 100)}%（${success}/${total}）`;
}
