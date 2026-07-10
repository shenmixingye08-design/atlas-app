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
    label: "作成後に確認",
    hint: "下書きまで作成し、その後確認します",
  },
  {
    level: "approve_then_run",
    label: "最後の実行前に確認",
    hint: "投稿・送信などの前に必ず確認します",
  },
  {
    level: "full_auto",
    label: "確認せず実行",
    hint: "重要操作がない場合のみ自動で進めます",
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

/** Important external actions cannot run without final confirmation. */
export function clampConfirmationLevel(
  level: AutomationExecutionLevel,
  flow: WorkExecutionFlow,
): AutomationExecutionLevel {
  if (level !== "full_auto") return level;
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
