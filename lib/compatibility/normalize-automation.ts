import { normalizeExecutionLevel } from "@/lib/automations/execution-level";
import {
  createDefaultExecutionFlow,
  inferWorkflowTemplate,
  normalizeExecutionFlow,
} from "@/lib/automations/execution-flow";
import { DEFAULT_AUTOMATION_TIMEZONE } from "@/lib/automations/schedule";
import { DEFAULT_AUTOMATION_TIMING } from "@/lib/automations/timing-defaults";
import type {
  Automation,
  AutomationEndCondition,
  AutomationExecutionLevel,
  AutomationExecutionMode,
  AutomationSchedule,
  AutomationStatus,
  AutomationTiming,
  AutomationTriggerKind,
  AutomationWorkflow,
  SchedulePreset,
  SnsBatchDays,
  WorkExecutionFlow,
} from "@/lib/automations/types";
import { normalizeExecutionMode } from "@/lib/cost-optimization/execution-mode";
import { normalizeSnsBatchDays } from "@/lib/cost-optimization/sns-batch";

import {
  asArray,
  asBoolean,
  asIsoTimestamp,
  asNonEmptyString,
  asNumber,
  asOptionalString,
  asString,
  clampNumber,
  isRecord,
  pickEnum,
} from "./guards";

const AUTOMATION_STATUSES = [
  "idle",
  "running",
  "success",
  "failed",
] as const satisfies readonly AutomationStatus[];

const SCHEDULE_KINDS = [
  "schedule",
  "webhook",
  "email",
  "calendar",
] as const satisfies readonly AutomationTriggerKind[];

const DEFAULT_AUTOMATION_STATUS: AutomationStatus = "idle";
const DEFAULT_SCHEDULE_PRESET: SchedulePreset = {
  type: "daily",
  hour: 9,
  minute: 0,
};

export type CompatibilityPresetType =
  | SchedulePreset["type"]
  | "custom";

/** Coerce unknown preset.type values — unknown becomes `"custom"`. */
export function normalizePresetType(raw: unknown): CompatibilityPresetType {
  const type = asString(raw, "custom");
  if (type === "daily" || type === "weekly" || type === "monthly") return type;
  return "custom";
}

/**
 * Normalize schedule preset data.
 * Returns `null` when missing or `"custom"` (unknown) so callers can substitute defaults.
 */
export function normalizeSchedulePreset(raw: unknown): SchedulePreset | null {
  if (isNullishPreset(raw)) return null;

  const record = isRecord(raw) ? raw : {};
  const type = normalizePresetType(record.type);
  if (type === "custom") return null;

  const hour = clampNumber(asNumber(record.hour, 9), 0, 23);
  const minute = clampNumber(asNumber(record.minute, 0), 0, 59);

  switch (type) {
    case "daily":
      return { type: "daily", hour, minute };
    case "weekly":
      return {
        type: "weekly",
        dayOfWeek: clampNumber(asNumber(record.dayOfWeek, 1), 0, 6),
        hour,
        minute,
      };
    case "monthly":
      return {
        type: "monthly",
        dayOfMonth: clampNumber(asNumber(record.dayOfMonth, 1), 1, 31),
        hour,
        minute,
      };
    default:
      return null;
  }
}

function isNullishPreset(raw: unknown): boolean {
  return raw === null || raw === undefined;
}

function normalizeWorkflowAssignment(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return asArray<unknown>(raw)
      .filter((item): item is string => typeof item === "string")
      .join("\n");
  }
  return "";
}

function normalizeWorkflow(raw: unknown): AutomationWorkflow {
  const record = isRecord(raw) ? raw : {};
  return {
    assignment: normalizeWorkflowAssignment(record.assignment),
    metadata: isRecord(record.metadata) ? record.metadata : undefined,
  };
}

function normalizeEndCondition(raw: unknown): AutomationEndCondition {
  const record = isRecord(raw) ? raw : {};
  const type = asString(record.type, "never");

  if (type === "until_date") {
    const until = asOptionalString(record.until);
    if (until && !Number.isNaN(Date.parse(until))) {
      return { type: "until_date", until };
    }
  }

  if (type === "occurrence_count") {
    return {
      type: "occurrence_count",
      maxOccurrences: Math.max(1, asNumber(record.maxOccurrences, 1)),
      completedOccurrences: Math.max(0, asNumber(record.completedOccurrences, 0)),
    };
  }

  return { type: "never" };
}

function normalizeTiming(raw: unknown): AutomationTiming {
  const record = isRecord(raw) ? raw : {};
  const startDateRaw = record.startDate;
  const startDate =
    startDateRaw === null
      ? null
      : asOptionalString(startDateRaw) &&
          !Number.isNaN(Date.parse(asOptionalString(startDateRaw)!))
        ? asOptionalString(startDateRaw)
        : null;

  return {
    startDate: startDate ?? DEFAULT_AUTOMATION_TIMING.startDate,
    endCondition: normalizeEndCondition(record.endCondition),
  };
}

function normalizeSchedule(raw: unknown): AutomationSchedule {
  const record = isRecord(raw) ? raw : {};
  const kind = pickEnum(record.kind, SCHEDULE_KINDS, "schedule");
  const label = asNonEmptyString(record.label, "未設定");

  if (kind !== "schedule") {
    return {
      kind,
      label,
      config: isRecord(record.config) ? record.config : undefined,
    };
  }

  const preset = normalizeSchedulePreset(record.preset) ?? DEFAULT_SCHEDULE_PRESET;
  const timezone = asNonEmptyString(record.timezone, DEFAULT_AUTOMATION_TIMEZONE);
  const cron = asOptionalString(record.cron) ?? undefined;

  return {
    kind: "schedule",
    preset,
    cron,
    timezone,
    label,
  };
}

function normalizeExecutionFlowField(
  raw: unknown,
  fallbackText: string,
): WorkExecutionFlow {
  if (isRecord(raw)) {
    return normalizeExecutionFlow(raw as WorkExecutionFlow);
  }
  return createDefaultExecutionFlow(inferWorkflowTemplate(fallbackText));
}

function normalizeExecutionLevelField(raw: unknown): AutomationExecutionLevel {
  return normalizeExecutionLevel(asString(raw, "suggest_only") as AutomationExecutionLevel);
}

function normalizeExecutionModeField(raw: unknown): AutomationExecutionMode {
  return normalizeExecutionMode(asString(raw, "standard") as AutomationExecutionMode);
}

function normalizeSnsBatchDaysField(raw: unknown): SnsBatchDays | null {
  return normalizeSnsBatchDays(raw as SnsBatchDays | null | undefined);
}

/**
 * Normalize a legacy or partial automation record for safe home/dashboard use.
 * Extend this function when new Automation fields are added.
 */
export function normalizeAutomation(raw: unknown): Automation {
  const record = isRecord(raw) ? raw : {};
  const now = new Date().toISOString();
  const name = asNonEmptyString(record.name, "無題の自動化");
  const workflow = normalizeWorkflow(record.workflow);
  const fallbackText = `${name} ${workflow.assignment}`;

  return {
    id: asNonEmptyString(record.id, `legacy-automation-${now}`),
    userId: asOptionalString(record.userId),
    name,
    description: asString(record.description, ""),
    schedule: normalizeSchedule(record.schedule),
    workflow,
    timing: normalizeTiming(record.timing),
    executionLevel: normalizeExecutionLevelField(record.executionLevel),
    executionMode: normalizeExecutionModeField(record.executionMode),
    snsBatchDays: normalizeSnsBatchDaysField(record.snsBatchDays),
    executionFlow: normalizeExecutionFlowField(record.executionFlow, fallbackText),
    enabled: asBoolean(record.enabled, true),
    lastRun: asOptionalString(record.lastRun),
    nextRun: asOptionalString(record.nextRun),
    status: pickEnum(record.status, AUTOMATION_STATUSES, DEFAULT_AUTOMATION_STATUS),
    lastWorkflowRunId: asOptionalString(record.lastWorkflowRunId),
    lastError: asOptionalString(record.lastError),
    successCount: Math.max(0, Number(record.successCount) || 0),
    failureCount: Math.max(0, Number(record.failureCount) || 0),
    runHistory: Array.isArray(record.runHistory)
      ? (record.runHistory as Automation["runHistory"]).slice(0, 20)
      : [],
    createdAt: asIsoTimestamp(record.createdAt, now),
    updatedAt: asIsoTimestamp(record.updatedAt, now),
  };
}

/** Normalize an array of unknown automation records. */
export function normalizeAutomations(raw: unknown): Automation[] {
  return asArray(raw).map(normalizeAutomation);
}
