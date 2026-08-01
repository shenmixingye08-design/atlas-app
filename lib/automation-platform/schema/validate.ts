import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { validateMemoryPolicy } from "@/lib/automation-platform/memory/contract";
import { normalizeExecutionPolicy } from "@/lib/automation-platform/execution/policy";
import {
  assertNotPastOneShot,
  validateScheduleSpec,
} from "@/lib/automation-platform/schedule/compute";
import { isValidTimeZone } from "@/lib/automation-platform/schedule/timezone";
import { isKnownCapabilityId } from "@/lib/automation-platform/step-registry/registry";
import {
  AUTOMATION_DEFINITION_STATUSES,
  DEFAULT_INSTRUCTION,
  DEFAULT_MEMORY_POLICY,
  DEFAULT_NOTIFICATION_POLICY,
  type AutomationV2,
  type CreateAutomationV2Input,
  type AutomationWorkflowDefinition,
  type AutomationWorkflowStep,
  type AutomationTrigger,
  type AutomationScheduleSpec,
  type NotificationChannel,
  type ScheduleFrequency,
} from "@/lib/automation-platform/types";
import { detectInstructionConflicts } from "@/lib/automation-platform/instruction/conflict";
import { computeNextRunIsoFromTrigger } from "@/lib/automation-platform/schedule/compute";

const CHANNELS: readonly NotificationChannel[] = [
  "in_app",
  "line",
  "web_push",
  "email",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createId(): string {
  return crypto.randomUUID();
}

function validateStep(raw: unknown, index: number): AutomationWorkflowStep {
  if (!isRecord(raw)) {
    throw new AutomationPlatformError("automation_invalid_definition", {
      field: `workflow.steps[${index}]`,
    });
  }
  if (typeof raw.type !== "string" || !isKnownCapabilityId(raw.type)) {
    throw new AutomationPlatformError("automation_unsupported_step", {
      field: `workflow.steps[${index}].type`,
      value: raw.type,
    });
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    throw new AutomationPlatformError("automation_invalid_definition", {
      field: `workflow.steps[${index}].name`,
    });
  }

  const order =
    typeof raw.order === "number" && Number.isInteger(raw.order)
      ? raw.order
      : index + 1;

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : createId(),
    type: raw.type,
    name: raw.name.trim(),
    order,
    inputBindings: isRecord(raw.inputBindings) ? raw.inputBindings : {},
    configuration: isRecord(raw.configuration) ? raw.configuration : {},
    requiresApproval: Boolean(raw.requiresApproval),
    retryPolicy: {
      maxAttempts:
        isRecord(raw.retryPolicy) &&
        typeof raw.retryPolicy.maxAttempts === "number"
          ? raw.retryPolicy.maxAttempts
          : 1,
      backoffMs:
        isRecord(raw.retryPolicy) && Array.isArray(raw.retryPolicy.backoffMs)
          ? raw.retryPolicy.backoffMs.filter(
              (v): v is number => typeof v === "number",
            )
          : [],
    },
    timeoutMs:
      typeof raw.timeoutMs === "number" && raw.timeoutMs > 0
        ? raw.timeoutMs
        : 120_000,
    onSuccess: typeof raw.onSuccess === "string" ? raw.onSuccess : null,
    onFailure: typeof raw.onFailure === "string" ? raw.onFailure : null,
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
  };
}

function validateWorkflow(raw: unknown): AutomationWorkflowDefinition {
  if (!isRecord(raw) || !Array.isArray(raw.steps)) {
    throw new AutomationPlatformError("automation_invalid_definition", {
      field: "workflow",
    });
  }
  if (raw.steps.length === 0) {
    throw new AutomationPlatformError("automation_invalid_definition", {
      field: "workflow.steps",
      reason: "empty",
    });
  }

  const steps = raw.steps.map((step, index) => validateStep(step, index));
  const onFailure = isRecord(raw.onFailure) ? raw.onFailure : {};
  const timeoutPolicy = isRecord(raw.timeoutPolicy) ? raw.timeoutPolicy : {};

  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    steps,
    onFailure: {
      strategy:
        onFailure.strategy === "continue" ||
        onFailure.strategy === "retry_workflow"
          ? onFailure.strategy
          : "stop",
      notify: onFailure.notify === undefined ? true : Boolean(onFailure.notify),
    },
    timeoutPolicy: {
      workflowTimeoutMs:
        typeof timeoutPolicy.workflowTimeoutMs === "number"
          ? timeoutPolicy.workflowTimeoutMs
          : 900_000,
      stepDefaultTimeoutMs:
        typeof timeoutPolicy.stepDefaultTimeoutMs === "number"
          ? timeoutPolicy.stepDefaultTimeoutMs
          : 120_000,
    },
  };
}

function validateTrigger(raw: unknown): AutomationTrigger {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    throw new AutomationPlatformError("automation_invalid_definition", {
      field: "trigger",
    });
  }

  const timezone =
    typeof raw.timezone === "string" && isValidTimeZone(raw.timezone)
      ? raw.timezone
      : null;
  if (!timezone) {
    throw new AutomationPlatformError("automation_invalid_schedule", {
      field: "trigger.timezone",
      value: raw.timezone,
    });
  }

  if (raw.type === "manual") {
    return {
      type: "manual",
      timezone,
      schedule: null,
      event: null,
      condition: null,
    };
  }

  if (raw.type === "schedule") {
    if (!isRecord(raw.schedule)) {
      throw new AutomationPlatformError("automation_invalid_schedule", {
        field: "trigger.schedule",
      });
    }
    const schedule: AutomationScheduleSpec = {
      frequency: raw.schedule.frequency as ScheduleFrequency,
      hour:
        typeof raw.schedule.hour === "number" ? raw.schedule.hour : 9,
      minute:
        typeof raw.schedule.minute === "number" ? raw.schedule.minute : 0,
      daysOfWeek: Array.isArray(raw.schedule.daysOfWeek)
        ? raw.schedule.daysOfWeek.filter(
            (value): value is number => typeof value === "number",
          )
        : undefined,
      dayOfMonth:
        typeof raw.schedule.dayOfMonth === "number"
          ? raw.schedule.dayOfMonth
          : undefined,
      runAt:
        typeof raw.schedule.runAt === "string" ? raw.schedule.runAt : null,
      cronDerived:
        typeof raw.schedule.cronDerived === "string"
          ? raw.schedule.cronDerived
          : null,
      startAt:
        typeof raw.schedule.startAt === "string" ? raw.schedule.startAt : null,
      endAt: typeof raw.schedule.endAt === "string" ? raw.schedule.endAt : null,
      maxOccurrences:
        typeof raw.schedule.maxOccurrences === "number"
          ? raw.schedule.maxOccurrences
          : null,
    };
    validateScheduleSpec(schedule, timezone);
    assertNotPastOneShot(schedule);
    return {
      type: "schedule",
      timezone,
      schedule,
      event: null,
      condition: null,
    };
  }

  if (raw.type === "event") {
    if (!isRecord(raw.event) || typeof raw.event.source !== "string") {
      throw new AutomationPlatformError("automation_invalid_definition", {
        field: "trigger.event",
      });
    }
    return {
      type: "event",
      timezone,
      schedule: null,
      event: {
        source: raw.event.source,
        eventType:
          typeof raw.event.eventType === "string"
            ? raw.event.eventType
            : "unknown",
        filter: isRecord(raw.event.filter) ? raw.event.filter : undefined,
      },
      condition: null,
    };
  }

  if (raw.type === "condition") {
    if (!isRecord(raw.condition) || typeof raw.condition.expression !== "string") {
      throw new AutomationPlatformError("automation_invalid_definition", {
        field: "trigger.condition",
      });
    }
    return {
      type: "condition",
      timezone,
      schedule: null,
      event: null,
      condition: {
        expression: raw.condition.expression,
        evaluatedFields: Array.isArray(raw.condition.evaluatedFields)
          ? raw.condition.evaluatedFields.filter(
              (v): v is string => typeof v === "string",
            )
          : undefined,
      },
    };
  }

  throw new AutomationPlatformError("automation_invalid_definition", {
    field: "trigger.type",
    value: raw.type,
  });
}

export function buildAutomationFromCreateInput(
  userId: string,
  input: CreateAutomationV2Input,
  now: Date = new Date(),
): AutomationV2 {
  if (!userId.trim()) {
    throw new AutomationPlatformError("automation_unauthorized");
  }
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new AutomationPlatformError("automation_invalid_definition", {
      field: "name",
    });
  }

  const trigger = validateTrigger(input.trigger);
  const workflow = validateWorkflow(input.workflow);
  const executionPolicy = normalizeExecutionPolicy(input.executionPolicy);
  const notificationPolicy = {
    ...DEFAULT_NOTIFICATION_POLICY,
    ...input.notificationPolicy,
    channels: (input.notificationPolicy?.channels ??
      DEFAULT_NOTIFICATION_POLICY.channels).filter((channel) =>
      CHANNELS.includes(channel),
    ),
  };
  const instruction = {
    structuredOptions:
      input.instruction?.structuredOptions ??
      DEFAULT_INSTRUCTION.structuredOptions,
    freeformNotes: input.instruction?.freeformNotes ?? "",
  };
  const memoryPolicy = {
    ...DEFAULT_MEMORY_POLICY,
    ...input.memoryPolicy,
    allowedScopes: input.memoryPolicy?.allowedScopes ?? [],
    deniedScopes: input.memoryPolicy?.deniedScopes ?? [],
    lockedOverrides: input.memoryPolicy?.lockedOverrides ?? {},
  };
  validateMemoryPolicy(memoryPolicy);

  const conflicts = detectInstructionConflicts(instruction);
  if (conflicts.length > 0 && input.rejectOnConflict !== false) {
    // Default: do not silently activate — force confirmation path
    if (input.rejectOnConflict === true) {
      throw new AutomationPlatformError("automation_conflicting_instruction", {
        conflicts,
      });
    }
  }

  let status = input.status ?? "draft";
  if (!AUTOMATION_DEFINITION_STATUSES.includes(status)) {
    throw new AutomationPlatformError("automation_invalid_definition", {
      field: "status",
      value: status,
    });
  }
  if (conflicts.length > 0 && status === "active") {
    status = "draft";
  }

  const timestamp = now.toISOString();
  const nextRunAt =
    status === "active" ? computeNextRunIsoFromTrigger(trigger, now) : null;

  return {
    id: createId(),
    userId,
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    status,
    trigger,
    workflow,
    executionPolicy,
    notificationPolicy,
    instruction,
    memoryPolicy,
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: null,
    nextRunAt,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function parseCreateAutomationBody(
  body: unknown,
): CreateAutomationV2Input {
  if (!isRecord(body)) {
    throw new AutomationPlatformError("automation_invalid_definition", {
      reason: "body_not_object",
    });
  }
  if (typeof body.name !== "string") {
    throw new AutomationPlatformError("automation_invalid_definition", {
      field: "name",
    });
  }
  return {
    name: body.name,
    description: typeof body.description === "string" ? body.description : "",
    status:
      typeof body.status === "string"
        ? (body.status as CreateAutomationV2Input["status"])
        : undefined,
    trigger: body.trigger as CreateAutomationV2Input["trigger"],
    workflow: body.workflow as CreateAutomationV2Input["workflow"],
    executionPolicy: isRecord(body.executionPolicy)
      ? (body.executionPolicy as CreateAutomationV2Input["executionPolicy"])
      : undefined,
    notificationPolicy: isRecord(body.notificationPolicy)
      ? (body.notificationPolicy as CreateAutomationV2Input["notificationPolicy"])
      : undefined,
    instruction: isRecord(body.instruction)
      ? (body.instruction as CreateAutomationV2Input["instruction"])
      : undefined,
    memoryPolicy: isRecord(body.memoryPolicy)
      ? (body.memoryPolicy as CreateAutomationV2Input["memoryPolicy"])
      : undefined,
    rejectOnConflict:
      typeof body.rejectOnConflict === "boolean"
        ? body.rejectOnConflict
        : undefined,
  };
}
