import "server-only";

import { automationService } from "@/lib/automations/automation-service";
import type { AutomationV2 } from "@/lib/automation-platform/types";
import type {
  AutomationExecutionLevel,
  CreateAutomationInput,
  SchedulePreset,
} from "@/lib/automations/types";

/**
 * Bridge active V2 automations into the existing V1 scheduler/tick path.
 * Phase 2 does not replace the worker — it registers a V1 shadow for execution.
 */

function mapExecutionLevel(
  automation: AutomationV2,
): AutomationExecutionLevel {
  const hasHighRisk = automation.workflow.steps.some(
    (step) =>
      step.enabled &&
      (step.type === "x_post" ||
        step.type === "gmail" ||
        step.type === "wordpress" ||
        step.type === "google_calendar"),
  );
  // Never bridge high-risk automations into V1 full_auto.
  if (hasHighRisk) return "approve_then_run";

  switch (automation.executionPolicy.mode) {
    case "run_then_notify":
      return "full_auto";
    case "review_before_run":
    case "approve_first_then_auto":
    case "review_selected_steps":
    case "review_high_risk_only":
    case "review_post_only":
    case "review_send_only":
      return "approve_then_run";
    default:
      return "approve_then_run";
  }
}

function mapPreset(automation: AutomationV2): SchedulePreset | null {
  const schedule = automation.trigger.schedule;
  if (!schedule || automation.trigger.type !== "schedule") return null;

  switch (schedule.frequency) {
    case "daily":
    case "weekdays":
      return {
        type: "daily",
        hour: schedule.hour,
        minute: schedule.minute,
      };
    case "weekly":
    case "custom_days":
      return {
        type: "weekly",
        dayOfWeek: schedule.daysOfWeek?.[0] ?? 1,
        hour: schedule.hour,
        minute: schedule.minute,
      };
    case "monthly":
    case "month_end":
      return {
        type: "monthly",
        dayOfMonth:
          schedule.frequency === "month_end" ? 31 : (schedule.dayOfMonth ?? 1),
        hour: schedule.hour,
        minute: schedule.minute,
      };
    case "once":
      return {
        type: "daily",
        hour: schedule.hour,
        minute: schedule.minute,
      };
    default:
      return null;
  }
}

function buildAssignment(automation: AutomationV2): string {
  const notes = automation.instruction.freeformNotes.trim();
  const stepNames = automation.workflow.steps
    .filter((step) => step.enabled)
    .map((step) => step.name)
    .join(" → ");
  const base = notes || automation.description || automation.name;
  return stepNames ? `${base}\n\nやること: ${stepNames}` : base;
}

export function buildV1CreateInputFromV2(
  automation: AutomationV2,
): CreateAutomationInput | null {
  if (automation.trigger.type === "manual") {
    // Manual-only: still register as disabled schedule placeholder so it appears in V1 list
    return {
      name: automation.name,
      description: automation.description,
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 9, minute: 0 },
        timezone: automation.trigger.timezone,
        label: "手動実行",
      },
      workflow: { assignment: buildAssignment(automation) },
      executionLevel: mapExecutionLevel(automation),
      executionMode: "standard",
      destination: automation.workflow.steps.some((s) => s.type === "x_post")
        ? "x"
        : "none",
      enabled: false,
      userId: automation.userId,
    };
  }

  if (automation.trigger.type !== "schedule") return null;
  const preset = mapPreset(automation);
  if (!preset) return null;

  const schedule = automation.trigger.schedule!;
  return {
    name: automation.name,
    description: automation.description,
    schedule: {
      kind: "schedule",
      preset,
      timezone: automation.trigger.timezone,
      label: automation.name,
      cron: schedule.cronDerived ?? undefined,
    },
    workflow: { assignment: buildAssignment(automation) },
    timing: {
      startDate: schedule.startAt ?? null,
      endCondition: schedule.endAt
        ? { type: "until_date", until: schedule.endAt }
        : schedule.maxOccurrences
          ? {
              type: "occurrence_count",
              maxOccurrences: schedule.maxOccurrences,
              completedOccurrences: 0,
            }
          : { type: "never" },
    },
    executionLevel: mapExecutionLevel(automation),
    executionMode: "standard",
    destination: automation.workflow.steps.some((s) => s.type === "x_post")
      ? "x"
      : "none",
    enabled: automation.status === "active",
    userId: automation.userId,
  };
}

export async function syncV2ToV1Scheduler(
  automation: AutomationV2,
): Promise<{ v1Id: string | null; registered: boolean }> {
  const input = buildV1CreateInputFromV2(automation);
  if (!input) {
    return { v1Id: null, registered: false };
  }

  // If already bridged, update the V1 shadow
  const existingV1Id =
    typeof automation.instruction.structuredOptions.v1SchedulerId === "string"
      ? automation.instruction.structuredOptions.v1SchedulerId
      : null;

  if (existingV1Id) {
    const updated = await automationService.updateForUser(
      existingV1Id,
      automation.userId,
      {
        name: input.name,
        description: input.description,
        schedule: input.schedule,
        workflow: input.workflow,
        timing: input.timing,
        executionLevel: input.executionLevel,
        destination: input.destination,
        enabled: input.enabled,
      },
    );
    return { v1Id: updated?.id ?? existingV1Id, registered: Boolean(updated) };
  }

  const created = await automationService.createForUser(
    automation.userId,
    input,
  );
  return { v1Id: created.id, registered: true };
}
