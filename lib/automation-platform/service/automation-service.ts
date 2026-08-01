import { appendAutomationAudit } from "@/lib/automation-platform/audit/log";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { resolveRunApprovalRequirement } from "@/lib/automation-platform/execution/policy";
import {
  buildIdempotencyKey,
  buildRunKey,
  buildScheduleOccurrenceKey,
} from "@/lib/automation-platform/idempotency/keys";
import { detectInstructionConflicts } from "@/lib/automation-platform/instruction/conflict";
import { validateMemoryPolicy } from "@/lib/automation-platform/memory/contract";
import {
  memoryGetAutomation,
  memoryGetRun,
  memoryInsertAutomation,
  memoryInsertRun,
  memoryListAutomationsForUser,
  memoryListRunsForAutomation,
  memoryUpdateAutomation,
  memoryUpdateRun,
} from "@/lib/automation-platform/repository/memory-store";
import { computeNextRunIsoFromTrigger } from "@/lib/automation-platform/schedule/compute";
import {
  buildAutomationFromCreateInput,
  parseCreateAutomationBody,
} from "@/lib/automation-platform/schema/validate";
import { checkAutomationRateLimit } from "@/lib/automation-platform/security/rate-limit";
import {
  assertDefinitionTransition,
  createStatusTransition,
} from "@/lib/automation-platform/state-machine/transitions";
import type {
  AutomationRun,
  AutomationV2,
  CreateAutomationV2Input,
  UpdateAutomationV2Input,
} from "@/lib/automation-platform/types";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";

function assertV2Enabled(context: FeatureAccessContext): void {
  if (!isFeatureEnabled("automation_v2_enabled", context)) {
    throw new AutomationPlatformError("automation_feature_disabled");
  }
}

function assertOwner(automation: AutomationV2 | null, userId: string): AutomationV2 {
  if (!automation || automation.userId !== userId) {
    throw new AutomationPlatformError("automation_not_found");
  }
  return automation;
}

function assertRateLimit(userId: string, action: string): void {
  const result = checkAutomationRateLimit({ userId, action });
  if (!result.allowed) {
    throw new AutomationPlatformError("automation_rate_limited", { action });
  }
}

export class AutomationPlatformService {
  create(
    userId: string,
    input: CreateAutomationV2Input,
    context: FeatureAccessContext,
  ): AutomationV2 {
    assertV2Enabled(context);
    assertRateLimit(userId, "create");

    if (input.memoryPolicy?.enabled) {
      if (!isFeatureEnabled("automation_memory_enabled", context)) {
        throw new AutomationPlatformError("automation_feature_disabled", {
          flag: "automation_memory_enabled",
        });
      }
    }

    const record = buildAutomationFromCreateInput(userId, input);
    const saved = memoryInsertAutomation(record);

    appendAutomationAudit({
      actorUserId: userId,
      action: "automation.create",
      automationId: saved.id,
      runId: null,
      outcome: "success",
      errorCode: null,
      meta: { status: saved.status, name: saved.name },
    });

    return saved;
  }

  createFromUnknownBody(
    userId: string,
    body: unknown,
    context: FeatureAccessContext,
  ): AutomationV2 {
    const input = parseCreateAutomationBody(body);
    return this.create(userId, input, context);
  }

  list(userId: string, context: FeatureAccessContext): AutomationV2[] {
    assertV2Enabled(context);
    assertRateLimit(userId, "list");
    return memoryListAutomationsForUser(userId);
  }

  get(userId: string, id: string, context: FeatureAccessContext): AutomationV2 {
    assertV2Enabled(context);
    return assertOwner(memoryGetAutomation(id), userId);
  }

  update(
    userId: string,
    id: string,
    patch: UpdateAutomationV2Input,
    context: FeatureAccessContext,
  ): AutomationV2 {
    assertV2Enabled(context);
    assertRateLimit(userId, "update");
    const current = assertOwner(memoryGetAutomation(id), userId);

    if (patch.status && patch.status !== current.status) {
      assertDefinitionTransition(current.status, patch.status);
    }

    if (patch.memoryPolicy) {
      validateMemoryPolicy({
        ...current.memoryPolicy,
        ...patch.memoryPolicy,
        allowedScopes:
          patch.memoryPolicy.allowedScopes ?? current.memoryPolicy.allowedScopes,
        deniedScopes:
          patch.memoryPolicy.deniedScopes ?? current.memoryPolicy.deniedScopes,
        lockedOverrides:
          patch.memoryPolicy.lockedOverrides ??
          current.memoryPolicy.lockedOverrides,
      });
      if (
        patch.memoryPolicy.enabled &&
        !isFeatureEnabled("automation_memory_enabled", context)
      ) {
        throw new AutomationPlatformError("automation_feature_disabled", {
          flag: "automation_memory_enabled",
        });
      }
    }

    const instruction = patch.instruction
      ? {
          structuredOptions:
            patch.instruction.structuredOptions ??
            current.instruction.structuredOptions,
          freeformNotes:
            patch.instruction.freeformNotes ?? current.instruction.freeformNotes,
        }
      : current.instruction;

    const conflicts = detectInstructionConflicts(instruction);
    let nextStatus = patch.status ?? current.status;
    if (conflicts.length > 0 && nextStatus === "active") {
      nextStatus = "draft";
    }

    const trigger = patch.trigger ?? current.trigger;
    const status = nextStatus;
    const nextRunAt =
      status === "active"
        ? computeNextRunIsoFromTrigger(trigger)
        : status === "paused" || status === "disabled" || status === "archived"
          ? null
          : current.nextRunAt;

    const updated: AutomationV2 = {
      ...current,
      ...patch,
      instruction,
      status,
      trigger,
      nextRunAt: patch.nextRunAt !== undefined ? patch.nextRunAt : nextRunAt,
      executionPolicy: patch.executionPolicy
        ? { ...patch.executionPolicy, systemHighRiskOverride: true as const }
        : current.executionPolicy,
      updatedAt: new Date().toISOString(),
    };

    const saved = memoryUpdateAutomation(updated);
    appendAutomationAudit({
      actorUserId: userId,
      action: "automation.update",
      automationId: saved.id,
      runId: null,
      outcome: "success",
      errorCode: null,
      meta: { status: saved.status },
    });
    return saved;
  }

  duplicate(
    userId: string,
    id: string,
    context: FeatureAccessContext,
  ): AutomationV2 {
    const source = this.get(userId, id, context);
    return this.create(
      userId,
      {
        name: `${source.name} (コピー)`,
        description: source.description,
        status: "draft",
        trigger: source.trigger,
        workflow: source.workflow,
        executionPolicy: source.executionPolicy,
        notificationPolicy: source.notificationPolicy,
        instruction: source.instruction,
        memoryPolicy: { ...source.memoryPolicy, enabled: false },
        rejectOnConflict: false,
      },
      context,
    );
  }

  pause(userId: string, id: string, context: FeatureAccessContext): AutomationV2 {
    return this.update(userId, id, { status: "paused", nextRunAt: null }, context);
  }

  resume(userId: string, id: string, context: FeatureAccessContext): AutomationV2 {
    const current = this.get(userId, id, context);
    const nextRunAt = computeNextRunIsoFromTrigger(current.trigger);
    return this.update(
      userId,
      id,
      { status: "active", nextRunAt },
      context,
    );
  }

  archive(
    userId: string,
    id: string,
    context: FeatureAccessContext,
  ): AutomationV2 {
    return this.update(
      userId,
      id,
      { status: "archived", nextRunAt: null },
      context,
    );
  }

  getNextRunAt(
    userId: string,
    id: string,
    context: FeatureAccessContext,
  ): string | null {
    const automation = this.get(userId, id, context);
    if (automation.status !== "active") return null;
    return computeNextRunIsoFromTrigger(automation.trigger);
  }

  /**
   * Manual / scheduled run creation with idempotency.
   * Does not invoke deliverable engines in Phase 1 — creates a durable Run contract.
   */
  enqueueRun(input: {
    userId: string;
    automationId: string;
    triggerType: "manual" | "schedule";
    scheduledFor?: string | null;
    clientIdempotencyKey?: string | null;
    context: FeatureAccessContext;
  }): { run: AutomationRun; created: boolean } {
    assertV2Enabled(input.context);
    assertRateLimit(input.userId, "run");

    const automation = assertOwner(
      memoryGetAutomation(input.automationId),
      input.userId,
    );

    if (automation.status === "paused") {
      throw new AutomationPlatformError("automation_paused");
    }
    if (
      automation.status === "disabled" ||
      automation.status === "archived" ||
      automation.status === "draft"
    ) {
      throw new AutomationPlatformError("automation_disabled", {
        status: automation.status,
      });
    }

    const conflicts = detectInstructionConflicts(automation.instruction);
    if (conflicts.length > 0) {
      throw new AutomationPlatformError("automation_conflicting_instruction", {
        conflicts,
      });
    }

    const scheduledFor =
      input.scheduledFor ??
      (input.triggerType === "schedule" ? automation.nextRunAt : null);

    const scheduleOccurrenceKey =
      input.triggerType === "schedule" && scheduledFor
        ? buildScheduleOccurrenceKey({
            automationId: automation.id,
            scheduledFor,
          })
        : null;

    const runKey = buildRunKey({
      automationId: automation.id,
      triggerType: input.triggerType,
      scheduledFor,
    });

    const idempotencyKey = buildIdempotencyKey({
      userId: input.userId,
      automationId: automation.id,
      operation: input.triggerType,
      occurrenceKey: scheduleOccurrenceKey,
      clientKey: input.clientIdempotencyKey,
    });

    const approval = resolveRunApprovalRequirement({
      policy: automation.executionPolicy,
      steps: automation.workflow.steps,
      isFirstRun: automation.lastRunAt === null,
      priorApprovalsCount: 0,
    });

    const approvalEnabled = isFeatureEnabled(
      "automation_approval_enabled",
      input.context,
    );

    const initialStatus =
      approval.requiresApproval && approvalEnabled
        ? "awaiting_approval"
        : "queued";

    const now = new Date().toISOString();
    const diagnosticId = crypto.randomUUID();
    const approvalExpiresAt =
      initialStatus === "awaiting_approval" &&
      automation.executionPolicy.approvalTimeoutMs
        ? new Date(
            Date.now() + automation.executionPolicy.approvalTimeoutMs,
          ).toISOString()
        : null;

    const run: AutomationRun = {
      id: crypto.randomUUID(),
      automationId: automation.id,
      userId: input.userId,
      status: "scheduled",
      runKey,
      idempotencyKey,
      scheduleOccurrenceKey,
      triggerType: input.triggerType,
      scheduledFor,
      queuedAt: initialStatus === "queued" ? now : null,
      startedAt: null,
      completedAt: null,
      attemptCount: 0,
      maxAttempts: 3,
      lastErrorCode: null,
      lastErrorMessage: null,
      resolvedInstruction: null,
      memoryReferences: [],
      statusHistory: [],
      approvalExpiresAt,
      resultSummary: null,
      createdAt: now,
      updatedAt: now,
    };

    // Apply initial transition scheduled -> preparing/awaiting/queued
    const first = createStatusTransition({
      previousStatus: "scheduled",
      nextStatus: initialStatus === "awaiting_approval" ? "awaiting_approval" : "queued",
      reason:
        initialStatus === "awaiting_approval"
          ? approval.reason
          : "enqueue",
      actor: { type: "user", userId: input.userId },
      diagnosticId,
      timestamp: now,
    });
    run.status = first.nextStatus;
    run.statusHistory = [first];

    const inserted = memoryInsertRun(run);
    if (!inserted.created) {
      appendAutomationAudit({
        actorUserId: input.userId,
        action: "automation.run.dedupe",
        automationId: automation.id,
        runId: inserted.run.id,
        outcome: "success",
        errorCode: "automation_duplicate_occurrence",
        meta: { scheduleOccurrenceKey, idempotencyKey },
      });
      return inserted;
    }

    // Advance nextRunAt for schedule triggers to prevent double scheduling
    if (input.triggerType === "schedule" && scheduledFor) {
      const next = computeNextRunIsoFromTrigger(
        automation.trigger,
        new Date(scheduledFor),
      );
      memoryUpdateAutomation({
        ...automation,
        nextRunAt: next,
        updatedAt: now,
      });
    }

    appendAutomationAudit({
      actorUserId: input.userId,
      action: "automation.run.enqueue",
      automationId: automation.id,
      runId: inserted.run.id,
      outcome: "success",
      errorCode: null,
      meta: { status: inserted.run.status, triggerType: input.triggerType },
    });

    return inserted;
  }

  listRuns(
    userId: string,
    automationId: string,
    context: FeatureAccessContext,
  ): AutomationRun[] {
    assertV2Enabled(context);
    assertOwner(memoryGetAutomation(automationId), userId);
    return memoryListRunsForAutomation({ userId, automationId });
  }

  getRun(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
  ): AutomationRun {
    assertV2Enabled(context);
    const run = memoryGetRun(runId);
    if (!run || run.userId !== userId) {
      throw new AutomationPlatformError("automation_not_found", {
        entity: "run",
      });
    }
    return run;
  }

  approveRun(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
  ): AutomationRun {
    assertV2Enabled(context);
    if (!isFeatureEnabled("automation_approval_enabled", context)) {
      throw new AutomationPlatformError("automation_feature_disabled", {
        flag: "automation_approval_enabled",
      });
    }
    assertRateLimit(userId, "approve");

    const run = this.getRun(userId, runId, context);
    if (
      run.approvalExpiresAt &&
      Date.parse(run.approvalExpiresAt) <= Date.now()
    ) {
      const expired = this.transitionRun(run, "expired", {
        type: "system",
        component: "approval_timeout",
      }, "approval_expired");
      throw new AutomationPlatformError("automation_approval_expired", {
        runId: expired.id,
      });
    }

    const updated = this.transitionRun(
      run,
      "queued",
      { type: "user", userId },
      "approved",
    );
    appendAutomationAudit({
      actorUserId: userId,
      action: "automation.run.approve",
      automationId: run.automationId,
      runId: run.id,
      outcome: "success",
      errorCode: null,
      meta: {},
    });
    return updated;
  }

  rejectRun(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
  ): AutomationRun {
    assertV2Enabled(context);
    const run = this.getRun(userId, runId, context);
    const updated = this.transitionRun(
      run,
      "cancelled",
      { type: "user", userId },
      "rejected",
    );
    appendAutomationAudit({
      actorUserId: userId,
      action: "automation.run.reject",
      automationId: run.automationId,
      runId: run.id,
      outcome: "success",
      errorCode: null,
      meta: {},
    });
    return updated;
  }

  cancelRun(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
  ): AutomationRun {
    assertV2Enabled(context);
    const run = this.getRun(userId, runId, context);
    return this.transitionRun(
      run,
      "cancelled",
      { type: "user", userId },
      "cancelled_by_user",
    );
  }

  /** Test/helper: advance run through legal transitions. */
  transitionRun(
    run: AutomationRun,
    nextStatus: AutomationRun["status"],
    actor: Parameters<typeof createStatusTransition>[0]["actor"],
    reason: string,
  ): AutomationRun {
    const transition = createStatusTransition({
      previousStatus: run.status,
      nextStatus,
      reason,
      actor,
      diagnosticId: crypto.randomUUID(),
    });
    const updated: AutomationRun = {
      ...run,
      status: nextStatus,
      queuedAt:
        nextStatus === "queued" ? run.queuedAt ?? transition.timestamp : run.queuedAt,
      startedAt:
        nextStatus === "running"
          ? run.startedAt ?? transition.timestamp
          : run.startedAt,
      completedAt: [
        "succeeded",
        "partially_succeeded",
        "failed",
        "skipped",
        "cancelled",
        "expired",
      ].includes(nextStatus)
        ? transition.timestamp
        : run.completedAt,
      statusHistory: [...run.statusHistory, transition],
      updatedAt: transition.timestamp,
    };
    return memoryUpdateRun(updated);
  }
}

export const automationPlatformService = new AutomationPlatformService();
