import { appendAutomationAudit } from "@/lib/automation-platform/audit/log";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import {
  normalizeExecutionPolicy,
  resolveRunApprovalRequirement,
} from "@/lib/automation-platform/execution/policy";
import { validateStepsForProductionActivation } from "@/lib/automation-platform/execution/production-step-registry";
import {
  buildIdempotencyKey,
  buildRunKey,
  buildScheduleOccurrenceKey,
  minuteBucket,
} from "@/lib/automation-platform/idempotency/keys";
import { detectInstructionConflicts } from "@/lib/automation-platform/instruction/conflict";
import { validateMemoryPolicy } from "@/lib/automation-platform/memory/contract";
import { syncV2ToV1Scheduler } from "@/lib/automation-platform/bridge/v2-to-v1-scheduler";
import {
  ensureAutomationsV2Hydrated,
  getAutomationV2FromSot,
  listAutomationsV2FromSot,
  persistAutomationV2Now,
} from "@/lib/automation-platform/durable";
import {
  ensureAutomationRunsV2Hydrated,
  getAutomationRunFromSot,
  insertAutomationRunSot,
  persistAutomationRunNow,
} from "@/lib/automation-platform/durable-runs";
import { dispatchAutomationRuns } from "@/lib/automation-platform/execution/dispatch";
import { notifyAutomationRunEvent } from "@/lib/automation-platform/execution/notify";
import {
  buildRunStepsFromAutomation,
  prepareRunSnapshot,
} from "@/lib/automation-platform/execution/prepare-run";
import { maybePrepareXPostCopyForRun } from "@/lib/automation-platform/execution/x-post-prepare";
import {
  findEnabledXPostStep,
  logXPostInstructionTrace,
  xPostInstructionPresence,
} from "@/lib/automation-platform/execution/x-post-instruction-trace";
import {
  readOriginalUserRequest,
  stampXPostStepsWithInstruction,
  stripV1AssignmentBridgeSuffix,
} from "@/lib/automation-platform/execution/x-post-content";
import { applyMemoryForAutomation } from "@/lib/memory-apply/automation";
import {
  dbListRunsForAutomation,
} from "@/lib/automation-platform/repository/db-store";
import {
  memoryGetRun,
  memoryListRunsForUser,
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
import {
  assertExternalsSatisfiedBySteps,
  ensureRequiredExternalSteps,
} from "@/lib/automations/ensure-external-steps";

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

async function assertRateLimit(userId: string, action: string): Promise<void> {
  const result = await checkAutomationRateLimit({ userId, action });
  if (!result.allowed) {
    throw new AutomationPlatformError("automation_rate_limited", { action });
  }
}

/**
 * Refuse activating automations that contain Production-unregistered steps
 * or unwired live adapters. Test harness may allow unwired externals so
 * controlled invokers can exercise mechanics without inventing Production success.
 */
function assertProductionStepsActivatable(
  steps: ReadonlyArray<{ id: string; type: string; enabled: boolean }>,
): void {
  const issues = validateStepsForProductionActivation(steps);
  const allowUnwiredExternal =
    process.env.VITEST === "true" ||
    process.env.AUTOMATION_ALLOW_UNWIRED_EXTERNAL_ACTIVATION === "true";
  const blocking = issues.filter((issue) => {
    if (issue.errorCode === "live_adapter_missing" && allowUnwiredExternal) {
      return false;
    }
    return true;
  });
  if (blocking.length === 0) return;
  const first = blocking[0]!;
  throw new AutomationPlatformError(
    first.errorCode === "live_adapter_missing"
      ? "automation_integration_required"
      : "automation_unsupported_step",
    {
      stepId: first.stepId,
      stepType: first.stepType,
      reason: first.message,
      issues: blocking,
    },
  );
}

/**
 * Inject missing Production external steps from instruction text before
 * persist / enqueue. Closes the gap where wizard/create mapped draft.steps
 * only and left requiredExternals as notes (diagnosticId aaef8557…).
 */
function healRequiredExternalSteps(automation: AutomationV2): {
  automation: AutomationV2;
  changed: boolean;
} {
  // Phase 4: condition/event triggers use Calendar as evaluation source only.
  // Never inject google_calendar *create* steps from watch NL.
  if (
    automation.trigger.type === "condition" ||
    automation.trigger.type === "event" ||
    automation.instruction.structuredOptions?.source ===
      "natural_language_condition"
  ) {
    return { automation, changed: false };
  }

  const originalUserRequest = readOriginalUserRequest({
    structuredOptions: automation.instruction.structuredOptions,
    freeformNotes: automation.instruction.freeformNotes,
    description: automation.description,
  });
  const ensured = ensureRequiredExternalSteps({
    steps: automation.workflow.steps,
    freeformNotes: automation.instruction.freeformNotes || originalUserRequest,
    structuredOptions: {
      ...(automation.instruction.structuredOptions ?? {}),
      ...(originalUserRequest ? { originalUserRequest } : {}),
    },
    sourceText: originalUserRequest || automation.instruction.freeformNotes,
  });
  ensured.steps = stampXPostStepsWithInstruction(
    ensured.steps,
    originalUserRequest,
  );
  if (ensured.unsupported.length > 0) {
    throw new AutomationPlatformError("automation_unsupported_step", {
      reason: `必須の外部操作をProduction手順として生成できません: ${ensured.unsupported.join(",")}`,
      unsupported: ensured.unsupported,
    });
  }
  const gate = assertExternalsSatisfiedBySteps({
    required: ensured.required,
    steps: ensured.steps,
  });
  if (!gate.ok) {
    throw new AutomationPlatformError("automation_invalid_definition", {
      reason: gate.reason,
      code: gate.code,
      missing: gate.missing,
    });
  }
  const nextInstruction = {
    ...automation.instruction,
    freeformNotes:
      automation.instruction.freeformNotes.trim() || originalUserRequest,
    structuredOptions: ensured.structuredOptions,
  };
  const stepsChanged =
    ensured.changed ||
    JSON.stringify(ensured.steps.map((step) => step.configuration)) !==
      JSON.stringify(
        automation.workflow.steps.map((step) => step.configuration),
      );
  const instructionChanged =
    nextInstruction.freeformNotes !== automation.instruction.freeformNotes ||
    nextInstruction.structuredOptions.originalUserRequest !==
      automation.instruction.structuredOptions?.originalUserRequest;
  if (!stepsChanged && !instructionChanged) {
    return { automation, changed: false };
  }
  return {
    changed: true,
    automation: {
      ...automation,
      workflow: {
        ...automation.workflow,
        steps: ensured.steps,
      },
      instruction: nextInstruction,
      updatedAt: new Date().toISOString(),
    },
  };
}

export class AutomationPlatformService {
  async create(
    userId: string,
    input: CreateAutomationV2Input,
    context: FeatureAccessContext,
  ): Promise<AutomationV2> {
    assertV2Enabled(context);
    await assertRateLimit(userId, "create");
    await ensureAutomationsV2Hydrated(userId);

    if (input.memoryPolicy?.enabled) {
      if (!isFeatureEnabled("automation_memory_enabled", context)) {
        throw new AutomationPlatformError("automation_feature_disabled", {
          flag: "automation_memory_enabled",
        });
      }
    }

    const built = buildAutomationFromCreateInput(userId, input);
    const healed = healRequiredExternalSteps(built);
    const record = healed.automation;
    if (record.status === "active") {
      assertProductionStepsActivatable(record.workflow.steps);
    }
    const { assertAutomationCreateAllowed, releaseAutomationSlotSafe } =
      await import("@/lib/billing/usage/automation-guard");
    await assertAutomationCreateAllowed({
      userId,
      automationId: record.id,
    });
    let saved;
    try {
      saved = await persistAutomationV2Now(record);
    } catch (error) {
      await releaseAutomationSlotSafe(record.id);
      throw error;
    }

    if (saved.status === "active") {
      saved = await this.registerWithScheduler(saved);
    }

    appendAutomationAudit({
      actorUserId: userId,
      action: "automation.create",
      automationId: saved.id,
      runId: null,
      outcome: "success",
      errorCode: null,
      meta: {
        status: saved.status,
        name: saved.name,
        schedulerRegistered: saved.status === "active",
      },
    });
    const createdX = findEnabledXPostStep(saved);
    if (createdX) {
      logXPostInstructionTrace({
        stage: "v2_persist",
        automationId: saved.id,
        ...xPostInstructionPresence({
          configuration: createdX.configuration,
          structuredOptions: saved.instruction.structuredOptions,
        }),
      });
    }

    return saved;
  }

  async createFromUnknownBody(
    userId: string,
    body: unknown,
    context: FeatureAccessContext,
  ): Promise<AutomationV2> {
    const input = parseCreateAutomationBody(body);
    return this.create(userId, input, context);
  }

  async list(
    userId: string,
    context: FeatureAccessContext,
  ): Promise<AutomationV2[]> {
    assertV2Enabled(context);
    await assertRateLimit(userId, "list");
    await ensureAutomationsV2Hydrated(userId);
    return listAutomationsV2FromSot(userId);
  }

  async get(
    userId: string,
    id: string,
    context: FeatureAccessContext,
  ): Promise<AutomationV2> {
    assertV2Enabled(context);
    await ensureAutomationsV2Hydrated(userId);
    const { resolveOwnedAutomationV2 } = await import(
      "@/lib/automations/resolve-owned-automation"
    );
    return assertOwner(await resolveOwnedAutomationV2(userId, id), userId);
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateAutomationV2Input,
    context: FeatureAccessContext,
  ): Promise<AutomationV2> {
    assertV2Enabled(context);
    await assertRateLimit(userId, "update");
    await ensureAutomationsV2Hydrated(userId);
    const { resolveOwnedAutomationV2 } = await import(
      "@/lib/automations/resolve-owned-automation"
    );
    const current = assertOwner(
      await resolveOwnedAutomationV2(userId, id),
      userId,
    );

    if (patch.status && patch.status !== current.status) {
      assertDefinitionTransition(current.status, patch.status);
    }
    if (
      current.status === "archived" &&
      patch.status &&
      patch.status !== "archived"
    ) {
      const { assertAutomationCreateAllowed } = await import(
        "@/lib/billing/usage/automation-guard"
      );
      await assertAutomationCreateAllowed({
        userId,
        automationId: id,
      });
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

    const updatedBase: AutomationV2 = {
      ...current,
      ...patch,
      instruction,
      status,
      trigger,
      nextRunAt: patch.nextRunAt !== undefined ? patch.nextRunAt : nextRunAt,
      executionPolicy: patch.executionPolicy
        ? normalizeExecutionPolicy({
            ...current.executionPolicy,
            ...patch.executionPolicy,
          })
        : current.executionPolicy,
      updatedAt: new Date().toISOString(),
    };
    const healedUpdate = healRequiredExternalSteps(updatedBase);
    const updated = healedUpdate.automation;

    if (updated.status === "active") {
      assertProductionStepsActivatable(updated.workflow.steps);
    }

    let saved = await persistAutomationV2Now(updated);

    if (
      saved.status === "active" ||
      current.status === "active" ||
      Boolean(saved.instruction.structuredOptions.v1SchedulerId)
    ) {
      saved = await this.registerWithScheduler(saved);
    }

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

  private async registerWithScheduler(
    automation: AutomationV2,
  ): Promise<AutomationV2> {
    const bridge = await syncV2ToV1Scheduler(automation);
    if (!bridge.v1Id) return automation;

    const next: AutomationV2 = {
      ...automation,
      instruction: {
        ...automation.instruction,
        structuredOptions: {
          ...automation.instruction.structuredOptions,
          v1SchedulerId: bridge.v1Id,
          schedulerRegistered: bridge.registered,
        },
      },
      updatedAt: new Date().toISOString(),
    };
    return await persistAutomationV2Now(next);
  }

  async duplicate(
    userId: string,
    id: string,
    context: FeatureAccessContext,
  ): Promise<AutomationV2> {
    const source = await this.get(userId, id, context);
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
        instruction: {
          ...source.instruction,
          structuredOptions: {
            ...source.instruction.structuredOptions,
            v1SchedulerId: undefined,
            schedulerRegistered: false,
          },
        },
        memoryPolicy: { ...source.memoryPolicy, enabled: false },
        rejectOnConflict: false,
      },
      context,
    );
  }

  async pause(
    userId: string,
    id: string,
    context: FeatureAccessContext,
    options?: {
      /** Keep in-flight runs running (default) or cancel them. */
      cancelRunningRuns?: boolean;
      /** Keep awaiting_approval / needs_input (default) or cancel them. */
      cancelPendingApprovals?: boolean;
    },
  ): Promise<{
    automation: AutomationV2;
    effects: {
      scheduleStopped: true;
      runningRuns: "continued" | "cancelled";
      pendingApprovals: "kept" | "cancelled";
      nextRunAt: null;
      resumeNote: string;
    };
  }> {
    const automation = await this.update(
      userId,
      id,
      { status: "paused", nextRunAt: null },
      context,
    );

    await ensureAutomationRunsV2Hydrated(userId);
    const runs = await dbListRunsForAutomation({ userId, automationId: id });
    let runningEffect: "continued" | "cancelled" = "continued";
    let approvalEffect: "kept" | "cancelled" = "kept";

    if (options?.cancelRunningRuns) {
      for (const run of runs) {
        if (
          run.status === "running" ||
          run.status === "queued" ||
          run.status === "retrying" ||
          run.status === "preparing"
        ) {
          try {
            await this.cancelRun(userId, run.id, context, {
              reason: "自動化の一時停止に伴いキャンセル",
            });
          } catch {
            // best-effort; pause itself must succeed
          }
        }
      }
      runningEffect = "cancelled";
    }

    if (options?.cancelPendingApprovals) {
      for (const run of runs) {
        if (
          run.status === "awaiting_approval" ||
          run.status === "needs_input"
        ) {
          try {
            await this.cancelRun(userId, run.id, context, {
              reason: "自動化の一時停止に伴い承認待ちをキャンセル",
            });
          } catch {
            // best-effort
          }
        }
      }
      approvalEffect = "cancelled";
    }

    appendAutomationAudit({
      actorUserId: userId,
      action: "automation.pause",
      automationId: id,
      runId: null,
      outcome: "success",
      errorCode: null,
      meta: { runningEffect, approvalEffect },
    });

    return {
      automation,
      effects: {
        scheduleStopped: true,
        runningRuns: runningEffect,
        pendingApprovals: approvalEffect,
        nextRunAt: null,
        resumeNote:
          "再開時は過去分をまとめて実行せず、次のスケジュールから再開します",
      },
    };
  }

  async resume(
    userId: string,
    id: string,
    context: FeatureAccessContext,
  ): Promise<AutomationV2> {
    const current = await this.get(userId, id, context);
    // Never backfill missed occurrences — compute next from now.
    const nextRunAt = computeNextRunIsoFromTrigger(current.trigger);
    return this.update(
      userId,
      id,
      { status: "active", nextRunAt },
      context,
    );
  }

  async archive(
    userId: string,
    id: string,
    context: FeatureAccessContext,
  ): Promise<AutomationV2> {
    const saved = await this.update(
      userId,
      id,
      { status: "archived", nextRunAt: null },
      context,
    );
    const { releaseAutomationSlotSafe } = await import(
      "@/lib/billing/usage/automation-guard"
    );
    await releaseAutomationSlotSafe(id);
    return saved;
  }

  async getNextRunAt(
    userId: string,
    id: string,
    context: FeatureAccessContext,
  ): Promise<string | null> {
    const automation = await this.get(userId, id, context);
    if (automation.status !== "active") return null;
    return computeNextRunIsoFromTrigger(automation.trigger);
  }

  /**
   * Create a Run, prepare review snapshot, gate on Approval, then dispatch.
   */
  async enqueueRun(input: {
    userId: string;
    automationId: string;
    triggerType: "manual" | "schedule" | "condition" | "event";
    scheduledFor?: string | null;
    clientIdempotencyKey?: string | null;
    context: FeatureAccessContext;
    /** When false, leave queued without executing (tests / deferred tick). */
    dispatch?: boolean;
    /**
     * Phase 4 — required for condition/event triggers.
     * Stored in schedule_occurrence_key for DB unique dedupe.
     */
    occurrenceKey?: string | null;
    conditionEvidence?: {
      previousState: boolean | null;
      currentState: boolean;
      provider: string;
      eventType: string;
      eventId: string;
      providerResourceId: string;
      conditionExpression: string | null;
      edgeReason: string;
    } | null;
  }): Promise<{ run: AutomationRun; created: boolean }> {
    assertV2Enabled(input.context);
    await assertRateLimit(input.userId, "run");
    await ensureAutomationsV2Hydrated(input.userId);
    await ensureAutomationRunsV2Hydrated(input.userId);

    let automation = assertOwner(
      await getAutomationV2FromSot(input.automationId, input.userId),
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

    // Self-heal definitions that retained Calendar NL in freeformNotes but
    // never persisted a google_calendar Production step (aaef8557…).
    // Phase 4 condition triggers must not invent calendar *create* steps.
    const isConditionTrigger =
      input.triggerType === "condition" || input.triggerType === "event";
    if (!isConditionTrigger) {
      const v1ShadowId =
        typeof automation.instruction.structuredOptions.v1SchedulerId ===
        "string"
          ? automation.instruction.structuredOptions.v1SchedulerId
          : automation.legacyAutomationId;
      if (
        v1ShadowId &&
        !readOriginalUserRequest({
          structuredOptions: automation.instruction.structuredOptions,
          freeformNotes: automation.instruction.freeformNotes,
          description: automation.description,
        })
      ) {
        try {
          const { automationService } = await import(
            "@/lib/automations/automation-service"
          );
          const shadow = await automationService.getByIdForUser(
            v1ShadowId,
            input.userId,
          );
          const recovered = stripV1AssignmentBridgeSuffix(
            shadow?.workflow.assignment ?? "",
          );
          if (recovered) {
            automation = {
              ...automation,
              instruction: {
                ...automation.instruction,
                freeformNotes:
                  automation.instruction.freeformNotes.trim() || recovered,
                structuredOptions: {
                  ...automation.instruction.structuredOptions,
                  originalUserRequest: recovered,
                },
              },
            };
          }
        } catch {
          // V1 shadow is best-effort recovery only.
        }
      }
      const healedForRun = healRequiredExternalSteps(automation);
      if (healedForRun.changed) {
        assertProductionStepsActivatable(healedForRun.automation.workflow.steps);
        automation = await persistAutomationV2Now(healedForRun.automation);
      }
    }

    const conflicts = detectInstructionConflicts(automation.instruction);
    if (conflicts.length > 0) {
      throw new AutomationPlatformError("automation_conflicting_instruction", {
        conflicts,
      });
    }

    if (isConditionTrigger && !input.occurrenceKey?.trim()) {
      throw new AutomationPlatformError("automation_invalid_definition", {
        field: "occurrenceKey",
        reason: "condition_occurrence_key_required",
      });
    }

    const scheduledFor =
      input.scheduledFor ??
      (input.triggerType === "schedule" ? automation.nextRunAt : null);

    const scheduleOccurrenceKey =
      isConditionTrigger && input.occurrenceKey?.trim()
        ? input.occurrenceKey.trim()
        : input.triggerType === "schedule" && scheduledFor
          ? buildScheduleOccurrenceKey({
              automationId: automation.id,
              scheduledFor,
            })
          : null;

    const nowMs = Date.now();
    const runKey = buildRunKey({
      automationId: automation.id,
      triggerType: input.triggerType,
      scheduledFor,
      manualBucket:
        input.triggerType === "manual" ? minuteBucket(nowMs) : null,
      occurrenceKey: scheduleOccurrenceKey,
    });

    const idempotencyKey = buildIdempotencyKey({
      userId: input.userId,
      automationId: automation.id,
      operation: input.triggerType,
      occurrenceKey: scheduleOccurrenceKey ?? runKey,
      clientKey: input.clientIdempotencyKey,
    });

    const priorApprovals = (
      await dbListRunsForAutomation({
        userId: input.userId,
        automationId: automation.id,
      })
    ).filter((run) => run.approval?.status === "approved").length;

    const approvalRequirement = resolveRunApprovalRequirement({
      policy: automation.executionPolicy,
      steps: automation.workflow.steps,
      isFirstRun: automation.lastRunAt === null,
      priorApprovalsCount: priorApprovals,
    });

    // Fail closed: never skip Approval when required (flag cannot bypass).
    const requiresApproval = approvalRequirement.requiresApproval;

    const now = new Date().toISOString();
    const diagnosticId = crypto.randomUUID();
    const approvalExpiresAt =
      requiresApproval && automation.executionPolicy.approvalTimeoutMs
        ? new Date(
            nowMs + automation.executionPolicy.approvalTimeoutMs,
          ).toISOString()
        : null;

    const memoryResolved = await applyMemoryForAutomation({ automation });
    const memoryUsage = memoryResolved.memoryUsage;
    const prepared = await maybePrepareXPostCopyForRun({
      automation,
      preparation: prepareRunSnapshot({
        automation,
        scheduledFor,
        memoryUsage,
        isFirstRun: automation.lastRunAt === null,
        priorApprovalsCount: priorApprovals,
      }),
      resolvedInstruction: memoryResolved.resolvedInstruction,
    });
    const preparation = prepared.preparation;
    memoryResolved.resolvedInstruction = prepared.resolvedInstruction;
    const steps = buildRunStepsFromAutomation(
      automation,
      preparation.approvalStepIds,
    );

    const conditionTriggerEvidence =
      isConditionTrigger && input.conditionEvidence && scheduleOccurrenceKey
        ? {
            previousState: input.conditionEvidence.previousState,
            currentState: input.conditionEvidence.currentState,
            provider: input.conditionEvidence.provider,
            eventType: input.conditionEvidence.eventType,
            eventId: input.conditionEvidence.eventId,
            providerResourceId: input.conditionEvidence.providerResourceId,
            conditionExpression: input.conditionEvidence.conditionExpression,
            edgeReason: input.conditionEvidence.edgeReason,
            occurrenceKey: scheduleOccurrenceKey,
            triggeredAt: now,
          }
        : null;

    let run: AutomationRun = {
      id: crypto.randomUUID(),
      automationId: automation.id,
      automationName: automation.name,
      userId: input.userId,
      status: "scheduled",
      runKey,
      idempotencyKey,
      scheduleOccurrenceKey,
      triggerType: input.triggerType,
      scheduledFor,
      queuedAt: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      attemptCount: 0,
      maxAttempts: 3,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      failedStepId: null,
      retryable: false,
      needsUserInput: false,
      resolvedInstruction: memoryResolved.resolvedInstruction,
      memoryUsage,
      memoryReferences: memoryUsage.used,
      statusHistory: [],
      preparation,
      approval: {
        status: requiresApproval ? "pending" : "not_required",
        mode: automation.executionPolicy.mode,
        requestedAt: requiresApproval ? now : null,
        decidedAt: null,
        decidedByUserId: null,
        comment: null,
        stepIds: approvalRequirement.stepIds,
      },
      steps,
      artifacts: [],
      attempts: [],
      approvalExpiresAt,
      resultSummary: null,
      diagnosticId,
      conditionTriggerEvidence,
      createdAt: now,
      updatedAt: now,
    };

    const toPreparing = createStatusTransition({
      previousStatus: "scheduled",
      nextStatus: "preparing",
      reason: "prepare_run",
      actor: { type: "system", component: "enqueue" },
      diagnosticId,
      timestamp: now,
    });
    run = {
      ...run,
      status: "preparing",
      statusHistory: [toPreparing],
      updatedAt: now,
    };

    const nextStatus = requiresApproval ? "awaiting_approval" : "queued";
    const afterPrepare = createStatusTransition({
      previousStatus: "preparing",
      nextStatus,
      reason: requiresApproval ? approvalRequirement.reason : "ready_to_run",
      actor: { type: "system", component: "enqueue" },
      diagnosticId,
      timestamp: now,
    });
    run = {
      ...run,
      status: nextStatus,
      queuedAt: nextStatus === "queued" ? now : null,
      statusHistory: [...run.statusHistory, afterPrepare],
      updatedAt: now,
    };

    const inserted = await insertAutomationRunSot(run);
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

    await persistAutomationRunNow(inserted.run);

    if (input.triggerType === "schedule" && scheduledFor) {
      const next = computeNextRunIsoFromTrigger(
        automation.trigger,
        new Date(scheduledFor),
      );
      await persistAutomationV2Now({
        ...automation,
        nextRunAt: next,
        updatedAt: now,
      });
    }

    if (inserted.run.status === "awaiting_approval") {
      await notifyAutomationRunEvent({
        userId: input.userId,
        automationName: automation.name,
        run: inserted.run,
        policy: automation.notificationPolicy,
        event: "awaiting_approval",
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
    if (automation.workflow.steps.some((step) => step.type === "x_post")) {
      const xStep = findEnabledXPostStep(automation);
      logXPostInstructionTrace({
        stage: "execution",
        automationId: automation.id,
        runId: inserted.run.id,
        executionId: inserted.run.id,
        ...xPostInstructionPresence({
          configuration: xStep?.configuration,
          structuredOptions: automation.instruction.structuredOptions,
        }),
        resolvedGenerateInstructionPresent: Boolean(
          preparation.resolvedGenerateInstruction,
        ),
        memoryUsed: Boolean(preparation.memoryUsed),
        classifyMode: preparation.xPostContentMode ?? null,
        classifyReason: preparation.xPostClassifyReason ?? null,
        needsInputReason: preparation.needsInputReason ?? null,
        generatedXPostTextPresent: Boolean(preparation.generatedXPostText),
      });
      appendAutomationAudit({
        actorUserId: input.userId,
        action: "automation.run.x_post_instruction",
        automationId: automation.id,
        runId: inserted.run.id,
        outcome: "success",
        errorCode: null,
        meta: {
          originalInstruction: preparation.originalInstruction ?? null,
          resolvedGenerateInstruction:
            preparation.resolvedGenerateInstruction ?? null,
          contentSource: preparation.contentSource ?? null,
          memoryUsed: preparation.memoryUsed ?? false,
          generatedXPostText: preparation.generatedXPostText ?? null,
          xPostContentMode: preparation.xPostContentMode ?? null,
          xPostClassifyReason: preparation.xPostClassifyReason ?? null,
          needsInputReason: preparation.needsInputReason ?? null,
        },
      });
    }

    const shouldDispatch = input.dispatch !== false && inserted.run.status === "queued";
    if (shouldDispatch) {
      await dispatchAutomationRuns({ runIds: [inserted.run.id] });
      const latest =
        (await getAutomationRunFromSot(inserted.run.id)) ?? inserted.run;
      await persistAutomationV2Now({
        ...automation,
        lastRunAt: latest.completedAt ?? latest.updatedAt,
        updatedAt: new Date().toISOString(),
      });
      return { run: latest, created: true };
    }

    return inserted;
  }

  async listRuns(
    userId: string,
    automationId: string,
    context: FeatureAccessContext,
  ): Promise<AutomationRun[]> {
    assertV2Enabled(context);
    await ensureAutomationsV2Hydrated(userId);
    await ensureAutomationRunsV2Hydrated(userId);
    assertOwner(await getAutomationV2FromSot(automationId, userId), userId);
    return dbListRunsForAutomation({ userId, automationId });
  }

  async listAllRuns(
    userId: string,
    context: FeatureAccessContext,
  ): Promise<AutomationRun[]> {
    assertV2Enabled(context);
    await ensureAutomationsV2Hydrated(userId);
    await ensureAutomationRunsV2Hydrated(userId);
    return memoryListRunsForUser(userId);
  }

  async getRun(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
  ): Promise<AutomationRun> {
    assertV2Enabled(context);
    // DB SoT is authoritative. Process memory is a cache only — after
    // one-shot hydrate, multi-instance / concurrent transitions can leave
    // memory.status stale (e.g. preparing/queued) while UI still shows
    // awaiting_approval from another instance. Approve must gate on SoT.
    const run = await getAutomationRunFromSot(runId);
    if (!run) {
      throw new AutomationPlatformError("run_not_found", {
        entity: "run",
      });
    }
    if (run.userId !== userId) {
      throw new AutomationPlatformError("run_permission_denied", {
        entity: "run",
      });
    }
    return run;
  }

  async getRunByDiagnosticId(
    userId: string,
    diagnosticId: string,
    context: FeatureAccessContext,
  ): Promise<AutomationRun> {
    assertV2Enabled(context);
    await ensureAutomationRunsV2Hydrated(userId);
    const run = memoryListRunsForUser(userId).find(
      (item) => item.diagnosticId === diagnosticId,
    );
    if (!run) {
      throw new AutomationPlatformError("run_not_found", {
        entity: "run",
        by: "diagnosticId",
      });
    }
    return this.getRun(userId, run.id, context);
  }

  async approveRun(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
    options?: { comment?: string | null; dispatch?: boolean },
  ): Promise<AutomationRun> {
    assertV2Enabled(context);
    // Approval API remains available whenever V2 is on — cannot leave runs stuck
    // behind a secondary flag (fail closed for skipping, fail open for deciding).
    await assertRateLimit(userId, "approve");

    const run = await this.getRun(userId, runId, context);
    if (run.status !== "awaiting_approval" && run.status !== "needs_input") {
      throw new AutomationPlatformError("automation_invalid_transition", {
        entity: "automation_run",
        from: run.status,
        to: "queued",
      });
    }
    if (
      run.approvalExpiresAt &&
      Date.parse(run.approvalExpiresAt) <= Date.now()
    ) {
      const expired = this.transitionRun(run, "expired", {
        type: "system",
        component: "approval_timeout",
      }, "approval_expired");
      await persistAutomationRunNow(expired);
      throw new AutomationPlatformError("automation_approval_expired", {
        runId: expired.id,
      });
    }

    const decidedAt = new Date().toISOString();
    const withApproval: AutomationRun = {
      ...run,
      approval: {
        status: "approved",
        mode: run.approval?.mode ?? "review_before_run",
        requestedAt: run.approval?.requestedAt ?? run.createdAt,
        decidedAt,
        decidedByUserId: userId,
        comment: options?.comment ?? null,
        stepIds: run.approval?.stepIds ?? [],
      },
      needsUserInput: false,
    };

    const updated = this.transitionRun(
      withApproval,
      "queued",
      { type: "user", userId },
      "approved",
    );
    await persistAutomationRunNow(updated);

    appendAutomationAudit({
      actorUserId: userId,
      action: "automation.run.approve",
      automationId: run.automationId,
      runId: run.id,
      outcome: "success",
      errorCode: null,
      meta: {},
    });

    if (options?.dispatch !== false) {
      try {
        await dispatchAutomationRuns({ runIds: [updated.id] });
      } catch {
        // Approval is already durable as queued. Dispatch/tick can retry;
        // do not surface executor FSM noise as "approve not allowed".
      }
      return (await getAutomationRunFromSot(updated.id)) ?? updated;
    }
    return updated;
  }

  async rejectRun(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
  ): Promise<AutomationRun> {
    assertV2Enabled(context);
    const run = await this.getRun(userId, runId, context);
    const rejected: AutomationRun = {
      ...run,
      approval: run.approval
        ? {
            ...run.approval,
            status: "rejected",
            decidedAt: new Date().toISOString(),
            decidedByUserId: userId,
          }
        : null,
    };
    const updated = this.transitionRun(
      rejected,
      "cancelled",
      { type: "user", userId },
      "rejected",
    );
    await persistAutomationRunNow(updated);
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

  async cancelRun(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
    options?: { reason?: string | null },
  ): Promise<AutomationRun> {
    assertV2Enabled(context);
    const run = await this.getRun(userId, runId, context);
    if (run.status === "cancelled") {
      throw new AutomationPlatformError("run_already_cancelled", {
        runId: run.id,
      });
    }
    if (
      run.status === "succeeded" ||
      run.status === "partially_succeeded"
    ) {
      throw new AutomationPlatformError("run_already_completed", {
        runId: run.id,
        status: run.status,
      });
    }
    try {
      const updated = this.transitionRun(
        {
          ...run,
          resultSummary: options?.reason
            ? `キャンセル理由: ${options.reason.slice(0, 200)}`
            : run.resultSummary,
          steps: run.steps.map((step) =>
            step.status === "pending" ||
            step.status === "running" ||
            step.status === "retrying" ||
            step.status === "waiting_approval"
              ? {
                  ...step,
                  status: "skipped" as const,
                  completedAt: new Date().toISOString(),
                  outputSummary:
                    step.status === "running"
                      ? "キャンセル要求を受け付けました（外部操作済み分は取り消せない場合があります）"
                      : "未実行のため停止しました",
                }
              : step,
          ),
        },
        "cancelled",
        { type: "user", userId },
        options?.reason?.trim()
          ? `cancelled_by_user:${options.reason.trim().slice(0, 80)}`
          : "cancelled_by_user",
      );
      await persistAutomationRunNow(updated);
      appendAutomationAudit({
        actorUserId: userId,
        action: "automation.run.cancel",
        automationId: run.automationId,
        runId: run.id,
        outcome: "success",
        errorCode: null,
        meta: {
          reason: options?.reason ?? null,
          preservedArtifacts: updated.artifacts.length,
        },
      });
      return updated;
    } catch (error) {
      if (error instanceof AutomationPlatformError) {
        if (error.code === "automation_invalid_transition") {
          throw new AutomationPlatformError("run_cancel_failed", {
            from: run.status,
          });
        }
        throw error;
      }
      throw new AutomationPlatformError("run_cancel_failed", {
        from: run.status,
      });
    }
  }

  /** Manual retry from a failed/retryable terminal or retrying run. */
  async retryRun(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
  ): Promise<AutomationRun> {
    assertV2Enabled(context);
    await assertRateLimit(userId, "retry");
    const run = await this.getRun(userId, runId, context);

    if (run.status === "retrying" || run.status === "queued") {
      await dispatchAutomationRuns({ runIds: [run.id] });
      return memoryGetRun(run.id) ?? run;
    }

    if (run.status === "succeeded") {
      throw new AutomationPlatformError("run_already_completed", {
        runId: run.id,
      });
    }
    if (run.status === "cancelled") {
      throw new AutomationPlatformError("run_already_cancelled", {
        runId: run.id,
      });
    }

    if (run.status !== "failed" && run.status !== "partially_succeeded") {
      throw new AutomationPlatformError("run_retry_not_allowed", {
        entity: "automation_run",
        from: run.status,
        to: "queued",
      });
    }
    if (!run.retryable && run.attemptCount >= run.maxAttempts) {
      throw new AutomationPlatformError("run_retry_not_allowed", {
        reason: "max_attempts",
      });
    }

    // Safe full retry: preserve external side-effects via step preparation.
    return this.retryRunSafe(userId, runId, context, { mode: "full" });
  }

  /**
   * Safe retry that never re-executes succeeded external actions.
   * Creates a new run occurrence carrying preserved artifacts/step outcomes.
   */
  async retryRunSafe(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
    options: {
      mode: "failed_only" | "from_failed" | "full";
      stepId?: string | null;
      /** When false, leave the new run queued for the caller to dispatch. */
      dispatch?: boolean;
    },
  ): Promise<AutomationRun> {
    assertV2Enabled(context);
    await assertRateLimit(userId, "retry");
    const { prepareStepsForSafeRetry, shouldSkipOnRetry } = await import(
      "@/lib/automation-platform/operations/idempotency"
    );
    const source = await this.getRun(userId, runId, context);

    if (
      source.status !== "failed" &&
      source.status !== "partially_succeeded" &&
      source.status !== "needs_input"
    ) {
      throw new AutomationPlatformError("run_retry_not_allowed", {
        from: source.status,
      });
    }

    const targetStepId = options.stepId ?? source.failedStepId;
    if (options.mode !== "full") {
      const target = source.steps.find((step) => step.id === targetStepId);
      if (!target) {
        throw new AutomationPlatformError("run_step_retry_not_allowed", {
          reason: "step_not_found",
        });
      }
      if (shouldSkipOnRetry(target)) {
        throw new AutomationPlatformError(
          "run_external_action_already_completed",
          { stepId: target.id, capabilityId: target.capabilityId },
        );
      }
      if (target.status === "succeeded" && options.mode === "failed_only") {
        throw new AutomationPlatformError("run_step_retry_not_allowed", {
          reason: "step_already_succeeded",
        });
      }
    }

    const enqueued = await this.enqueueRun({
      userId,
      automationId: source.automationId,
      triggerType: "manual",
      clientIdempotencyKey: `safe-retry:${source.id}:${options.mode}:${targetStepId ?? "all"}:${minuteBucket(Date.now())}`,
      context,
      dispatch: false,
    });

    let run = enqueued.run;
    const preparedSteps = prepareStepsForSafeRetry(source.steps, {
      mode: options.mode,
      failedStepId: targetStepId ?? null,
    });

    // Merge: keep source step outcomes for succeeded/skipped; reset targets.
    const byId = new Map(preparedSteps.map((step) => [step.id, step]));
    run = {
      ...run,
      triggerType: "retry",
      artifacts: [...source.artifacts],
      steps: run.steps.map((step) => {
        const prepared = byId.get(step.id);
        return prepared
          ? {
              ...step,
              status: prepared.status,
              startedAt: prepared.startedAt,
              completedAt: prepared.completedAt,
              errorCode: prepared.errorCode,
              errorMessage: prepared.errorMessage,
              outputSummary: prepared.outputSummary,
              attemptCount: prepared.attemptCount,
            }
          : step;
      }),
      resultSummary: `前回実行（${source.id.slice(0, 8)}）から安全に再実行`,
      lastErrorCode: null,
      lastErrorMessage: null,
      failedStepId: null,
      needsUserInput: false,
      retryable: true,
    };

    // If approval was already granted on source and policy allows, keep queued.
    if (
      run.status === "awaiting_approval" &&
      source.approval?.status === "approved"
    ) {
      run = this.transitionRun(
        {
          ...run,
          approval: {
            status: "approved",
            mode: source.approval.mode,
            requestedAt: source.approval.requestedAt,
            decidedAt: new Date().toISOString(),
            decidedByUserId: userId,
            comment: "前回承認を引き継ぎ",
            stepIds: source.approval.stepIds,
          },
        },
        "queued",
        { type: "user", userId },
        "retry_reuse_approval",
      );
    }

    await persistAutomationRunNow(run);
    appendAutomationAudit({
      actorUserId: userId,
      action: "automation.run.safe_retry",
      automationId: source.automationId,
      runId: run.id,
      outcome: "success",
      errorCode: null,
      meta: {
        sourceRunId: source.id,
        mode: options.mode,
        stepId: targetStepId,
        preservedArtifacts: run.artifacts.length,
      },
    });

    if (run.status === "queued" && options.dispatch !== false) {
      await dispatchAutomationRuns({ runIds: [run.id] });
      return memoryGetRun(run.id) ?? run;
    }
    return run;
  }

  async resumeRunAfterInput(
    userId: string,
    runId: string,
    context: FeatureAccessContext,
    inputPatch?: Record<string, unknown>,
    options?: { dispatch?: boolean },
  ): Promise<AutomationRun> {
    assertV2Enabled(context);
    const run = await this.getRun(userId, runId, context);
    if (run.status !== "needs_input" && !run.needsUserInput) {
      throw new AutomationPlatformError("run_resume_not_allowed", {
        from: run.status,
      });
    }

    const { interpretResumeXPostInput } = await import(
      "@/lib/automation-platform/execution/x-post-content"
    );
    const resumeInput = interpretResumeXPostInput(inputPatch);
    // Prefer continuing the same run from the waiting step (no full restart).
    const steps = run.steps.map((step) =>
      step.status === "waiting_approval" || step.status === "failed"
        ? {
            ...step,
            status: "pending" as const,
            errorCode: null,
            errorMessage: null,
            outputSummary: inputPatch
              ? "入力を反映して再開します"
              : step.outputSummary,
          }
        : step,
    );

    const resumeNotes =
      resumeInput.kind === "constraint"
        ? resumeInput.value
        : run.preparation?.resumeNotes ?? null;
    let nextResolved: AutomationRun["resolvedInstruction"] = run.resolvedInstruction
      ? {
          ...run.resolvedInstruction,
          merged: {
            ...run.resolvedInstruction.merged,
            resumeNotes,
            ...(resumeInput.kind === "explicit_fixed"
              ? { generatedXPostText: resumeInput.value }
              : { generatedXPostText: null }),
          },
        }
      : run.resolvedInstruction;

    let nextPreparation: AutomationRun["preparation"] = run.preparation
      ? {
          ...run.preparation,
          resumeNotes,
          generatedXPostText:
            resumeInput.kind === "explicit_fixed" ? resumeInput.value : null,
          generatedAt:
            resumeInput.kind === "explicit_fixed"
              ? new Date().toISOString()
              : null,
          xPostContentMode:
            resumeInput.kind === "explicit_fixed"
              ? ("fixed" as const)
              : run.preparation.xPostContentMode,
          summary: inputPatch
            ? `${run.preparation.summary}\n\n追加入力: ${JSON.stringify(inputPatch).slice(0, 300)}`
            : run.preparation.summary,
        }
      : run.preparation;

    if (resumeInput.kind !== "explicit_fixed" && nextPreparation) {
      const automation = await this.get(userId, run.automationId, context);
      const prepared = await maybePrepareXPostCopyForRun({
        automation,
        preparation: nextPreparation,
        resolvedInstruction: nextResolved,
      });
      nextPreparation = prepared.preparation;
      nextResolved = prepared.resolvedInstruction;
    }

    const updated = this.transitionRun(
      {
        ...run,
        steps,
        needsUserInput: false,
        lastErrorCode: null,
        lastErrorMessage: null,
        failedStepId: null,
        resolvedInstruction: nextResolved,
        preparation: nextPreparation,
      },
      "queued",
      { type: "user", userId },
      "resumed_after_input",
    );
    await persistAutomationRunNow(updated);
    if (options?.dispatch === false) {
      return updated;
    }
    await dispatchAutomationRuns({ runIds: [updated.id] });
    return memoryGetRun(updated.id) ?? updated;
  }

  async getOperationsSummary(
    userId: string,
    context: FeatureAccessContext,
  ) {
    assertV2Enabled(context);
    await ensureAutomationsV2Hydrated(userId);
    await ensureAutomationRunsV2Hydrated(userId);
    const { buildAutomationOperationsSummary } = await import(
      "@/lib/automation-platform/operations/summary"
    );
    return buildAutomationOperationsSummary({
      automations: await listAutomationsV2FromSot(userId),
      runs: memoryListRunsForUser(userId),
    });
  }

  async searchRuns(
    userId: string,
    context: FeatureAccessContext,
    filters: import("@/lib/automation-platform/history/search").RunSearchFilters,
    sort?: import("@/lib/automation-platform/history/search").RunSortKey,
  ): Promise<AutomationRun[]> {
    assertV2Enabled(context);
    await ensureAutomationRunsV2Hydrated(userId);
    const { filterAutomationRuns, sortAutomationRuns } = await import(
      "@/lib/automation-platform/history/search"
    );
    // diagnosticId alone must still be ownership-scoped (list is user-scoped).
    const filtered = filterAutomationRuns(
      memoryListRunsForUser(userId),
      filters,
    );
    return sortAutomationRuns(filtered, sort ?? "newest");
  }

  async processDueRuns(
    context: FeatureAccessContext,
    limit = 20,
  ): Promise<{ processed: number }> {
    assertV2Enabled(context);
    const result = await dispatchAutomationRuns({ limit });
    return { processed: result.processed };
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
      diagnosticId: run.diagnosticId || crypto.randomUUID(),
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
