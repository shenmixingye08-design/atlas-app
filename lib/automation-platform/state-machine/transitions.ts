import type {
  AutomationDefinitionStatus,
  AutomationRunStatus,
  RunActor,
} from "@/lib/automation-platform/types";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";

/** Allowed Automation definition status transitions. */
const DEFINITION_TRANSITIONS: Record<
  AutomationDefinitionStatus,
  readonly AutomationDefinitionStatus[]
> = {
  draft: ["active", "disabled", "archived"],
  active: ["paused", "disabled", "archived"],
  paused: ["active", "disabled", "archived"],
  disabled: ["draft", "archived"],
  archived: [],
};

/**
 * Allowed AutomationRun status transitions.
 * Terminal states have no outbound edges.
 */
const RUN_TRANSITIONS: Record<
  AutomationRunStatus,
  readonly AutomationRunStatus[]
> = {
  scheduled: ["preparing", "queued", "awaiting_approval", "skipped", "cancelled", "expired"],
  preparing: [
    "awaiting_approval",
    "queued",
    "running",
    "needs_input",
    "skipped",
    "cancelled",
    "failed",
  ],
  awaiting_approval: [
    "queued",
    "cancelled",
    "expired",
    "skipped",
    "needs_input",
  ],
  queued: ["running", "cancelled", "expired", "skipped"],
  running: [
    "retrying",
    "awaiting_approval",
    "needs_input",
    "succeeded",
    "partially_succeeded",
    "failed",
    "cancelled",
  ],
  retrying: ["queued", "running", "failed", "cancelled", "expired"],
  needs_input: ["preparing", "queued", "cancelled", "expired", "skipped"],
  succeeded: [],
  partially_succeeded: [],
  failed: [],
  skipped: [],
  cancelled: [],
  expired: [],
};

export function canTransitionDefinitionStatus(
  from: AutomationDefinitionStatus,
  to: AutomationDefinitionStatus,
): boolean {
  if (from === to) return true;
  return DEFINITION_TRANSITIONS[from].includes(to);
}

export function assertDefinitionTransition(
  from: AutomationDefinitionStatus,
  to: AutomationDefinitionStatus,
): void {
  if (!canTransitionDefinitionStatus(from, to)) {
    throw new AutomationPlatformError("automation_invalid_transition", {
      entity: "automation",
      from,
      to,
    });
  }
}

export function canTransitionRunStatus(
  from: AutomationRunStatus,
  to: AutomationRunStatus,
): boolean {
  if (from === to) return true;
  return RUN_TRANSITIONS[from].includes(to);
}

export function assertRunTransition(
  from: AutomationRunStatus,
  to: AutomationRunStatus,
): void {
  if (!canTransitionRunStatus(from, to)) {
    throw new AutomationPlatformError("automation_invalid_transition", {
      entity: "automation_run",
      from,
      to,
    });
  }
}

export function createStatusTransition(input: {
  previousStatus: AutomationRunStatus;
  nextStatus: AutomationRunStatus;
  reason: string;
  actor: RunActor;
  diagnosticId: string;
  timestamp?: string;
}) {
  assertRunTransition(input.previousStatus, input.nextStatus);
  return {
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    timestamp: input.timestamp ?? new Date().toISOString(),
    reason: input.reason,
    actor: input.actor,
    diagnosticId: input.diagnosticId,
  };
}
