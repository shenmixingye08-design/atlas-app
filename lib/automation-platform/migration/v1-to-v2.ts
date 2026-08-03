import type { Automation as AutomationV1 } from "@/lib/automations/types";
import {
  DEFAULT_EXECUTION_POLICY,
  DEFAULT_INSTRUCTION,
  DEFAULT_MEMORY_POLICY,
  DEFAULT_NOTIFICATION_POLICY,
  type AutomationV2,
  type AutomationWorkflowStep,
  type ExecutionPolicyMode,
} from "@/lib/automation-platform/types";
import { memoryFindByLegacyId, memoryInsertAutomation } from "@/lib/automation-platform/repository/memory-store";
import { DEFAULT_AUTOMATION_PLATFORM_TIMEZONE } from "@/lib/automation-platform/schedule/timezone";

export type MigrationMode = "dry-run" | "apply";

export type MigrationItemResult = {
  legacyId: string;
  newId: string | null;
  status: "migrated" | "skipped_existing" | "protected_draft" | "failed";
  reason: string;
};

export type MigrationReport = {
  mode: MigrationMode;
  sourceCount: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  protectedDraftCount: number;
  idMap: Record<string, string>;
  items: MigrationItemResult[];
  rollbackProcedure: string[];
  backupPrerequisite: string;
  autoApplyToProduction: false;
};

function mapExecutionMode(level: AutomationV1["executionLevel"]): ExecutionPolicyMode {
  switch (level) {
    case "suggest_only":
    case "approve_then_run":
      return "review_before_run";
    case "draft_save":
      return "review_selected_steps";
    case "full_auto":
      return "run_then_notify";
    default:
      return "review_before_run";
  }
}

function mapSchedule(v1: AutomationV1): AutomationV2["trigger"] {
  const timezone =
    v1.schedule.kind === "schedule"
      ? v1.schedule.timezone || DEFAULT_AUTOMATION_PLATFORM_TIMEZONE
      : DEFAULT_AUTOMATION_PLATFORM_TIMEZONE;

  if (v1.schedule.kind !== "schedule") {
    return {
      type: "manual",
      timezone,
      schedule: null,
      event: null,
      condition: null,
    };
  }

  const preset = v1.schedule.preset;
  const timingFields = {
    cronDerived: v1.schedule.cron ?? null,
    startAt: v1.timing.startDate,
    endAt:
      v1.timing.endCondition.type === "until_date"
        ? v1.timing.endCondition.until
        : null,
    maxOccurrences:
      v1.timing.endCondition.type === "occurrence_count"
        ? v1.timing.endCondition.maxOccurrences
        : null,
  };

  if (preset.type === "minutely") {
    return {
      type: "schedule",
      timezone,
      schedule: {
        frequency: "daily",
        hour: 0,
        minute: 0,
        ...timingFields,
        cronDerived: v1.schedule.cron ?? "* * * * *",
      },
      event: null,
      condition: null,
    };
  }
  if (preset.type === "hourly") {
    return {
      type: "schedule",
      timezone,
      schedule: {
        frequency: "daily",
        hour: 0,
        minute: preset.minute,
        ...timingFields,
        cronDerived: v1.schedule.cron ?? `${preset.minute} * * * *`,
      },
      event: null,
      condition: null,
    };
  }
  if (preset.type === "daily") {
    return {
      type: "schedule",
      timezone,
      schedule: {
        frequency: "daily",
        hour: preset.hour,
        minute: preset.minute,
        ...timingFields,
      },
      event: null,
      condition: null,
    };
  }
  if (preset.type === "weekly") {
    return {
      type: "schedule",
      timezone,
      schedule: {
        frequency: "weekly",
        hour: preset.hour,
        minute: preset.minute,
        daysOfWeek: [preset.dayOfWeek],
        ...timingFields,
      },
      event: null,
      condition: null,
    };
  }

  return {
    type: "schedule",
    timezone,
    schedule: {
      frequency: "monthly",
      hour: preset.hour,
      minute: preset.minute,
      dayOfMonth: preset.dayOfMonth,
      ...timingFields,
    },
    event: null,
    condition: null,
  };
}

function mapWorkflow(v1: AutomationV1): AutomationV2["workflow"] {
  const steps: AutomationWorkflowStep[] = [
    {
      id: "orchestrate",
      type: "orchestrate",
      name: "仕事の遂行",
      order: 1,
      inputBindings: { assignment: v1.workflow.assignment },
      configuration: {
        templateId: v1.executionFlow.templateId,
        enabledSteps: v1.executionFlow.steps,
      },
      requiresApproval: false,
      retryPolicy: { maxAttempts: 3, backoffMs: [60_000, 300_000, 900_000] },
      timeoutMs: 600_000,
      onSuccess: null,
      onFailure: null,
      enabled: true,
    },
  ];

  if (v1.destination === "x") {
    steps.push({
      id: "x_post",
      type: "x_post",
      name: "X投稿",
      order: 2,
      inputBindings: {},
      configuration: {},
      requiresApproval: true,
      retryPolicy: { maxAttempts: 3, backoffMs: [60_000, 300_000, 900_000] },
      timeoutMs: 120_000,
      onSuccess: null,
      onFailure: null,
      enabled: true,
    });
  }

  return {
    version: 1,
    steps,
    onFailure: { strategy: "stop", notify: true },
    timeoutPolicy: {
      workflowTimeoutMs: 900_000,
      stepDefaultTimeoutMs: 120_000,
    },
  };
}

/**
 * Convert a V1 automation into V2.
 * Uncertain / unsafe conversions are forced to draft (never auto-active).
 */
export function convertV1ToV2(v1: AutomationV1): {
  record: AutomationV2;
  protectedDraft: boolean;
  reason: string;
} {
  const now = new Date().toISOString();
  const userId = v1.userId;
  const protectedDraft =
    !userId ||
    !v1.workflow.assignment?.trim() ||
    v1.schedule.kind !== "schedule";

  const status = protectedDraft
    ? "draft"
    : v1.enabled
      ? "draft" // Never auto-activate on migration — require review
      : "paused";

  const record: AutomationV2 = {
    id: crypto.randomUUID(),
    userId: userId ?? "unknown",
    name: v1.name || "名称未設定の自動化",
    description: v1.description || "",
    status,
    trigger: mapSchedule(v1),
    workflow: mapWorkflow(v1),
    executionPolicy: {
      ...DEFAULT_EXECUTION_POLICY,
      mode: mapExecutionMode(v1.executionLevel),
      systemHighRiskOverride: true,
    },
    notificationPolicy: { ...DEFAULT_NOTIFICATION_POLICY },
    instruction: {
      ...DEFAULT_INSTRUCTION,
      structuredOptions: {
        destination: v1.destination,
        executionMode: v1.executionMode,
        snsBatchDays: v1.snsBatchDays,
        executionFlow: v1.executionFlow,
      },
      freeformNotes: v1.workflow.assignment,
    },
    memoryPolicy: { ...DEFAULT_MEMORY_POLICY, enabled: false },
    legacyAutomationId: v1.id,
    schemaVersion: 2,
    lastRunAt: v1.lastRun,
    nextRunAt: null, // recompute after user reviews
    createdAt: v1.createdAt || now,
    updatedAt: now,
  };

  return {
    record,
    protectedDraft: true,
    reason: protectedDraft
      ? "incomplete_or_unowned_source"
      : "migrated_as_draft_for_review",
  };
}

export function migrateV1Automations(
  sources: readonly AutomationV1[],
  mode: MigrationMode = "dry-run",
): MigrationReport {
  const items: MigrationItemResult[] = [];
  const idMap: Record<string, string> = {};
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  let protectedDraftCount = 0;

  for (const source of sources) {
    try {
      const existing = memoryFindByLegacyId(source.id);
      if (existing) {
        skippedCount += 1;
        idMap[source.id] = existing.id;
        items.push({
          legacyId: source.id,
          newId: existing.id,
          status: "skipped_existing",
          reason: "already_migrated",
        });
        continue;
      }

      const converted = convertV1ToV2(source);
      if (converted.protectedDraft) protectedDraftCount += 1;

      if (mode === "apply") {
        const saved = memoryInsertAutomation(converted.record);
        idMap[source.id] = saved.id;
        successCount += 1;
        items.push({
          legacyId: source.id,
          newId: saved.id,
          status: "protected_draft",
          reason: converted.reason,
        });
      } else {
        idMap[source.id] = converted.record.id;
        successCount += 1;
        items.push({
          legacyId: source.id,
          newId: converted.record.id,
          status: "protected_draft",
          reason: `dry-run:${converted.reason}`,
        });
      }
    } catch (error) {
      failureCount += 1;
      items.push({
        legacyId: source.id,
        newId: null,
        status: "failed",
        reason: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return {
    mode,
    sourceCount: sources.length,
    successCount,
    failureCount,
    skippedCount,
    protectedDraftCount,
    idMap,
    items,
    rollbackProcedure: [
      "1. Stop writing new V2 automations (turn automation_v2_enabled off).",
      "2. Restore atlas_automations / atlas_automation_runs from pre-migration backup.",
      "3. Keep atlas_user_state domain atlasAutomations (V1) untouched — it is the rollback source.",
      "4. Clear V2 legacy_id map rows for rolled-back ids.",
      "5. Verify V1 /api/automations still lists original records.",
    ],
    backupPrerequisite:
      "Take a DB snapshot of atlas_user_state (atlasAutomations) and any V2 tables before apply.",
    autoApplyToProduction: false,
  };
}
