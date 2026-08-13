/**
 * Phase 4 condition runtime:
 * trigger → evaluate → false no-op / true edge → occurrence → enqueue → dispatch.
 */

import "server-only";

import { appendAutomationAudit } from "@/lib/automation-platform/audit/log";
import {
  ensureAutomationsV2Hydrated,
  persistAutomationV2Now,
} from "@/lib/automation-platform/durable";
import { ensureAutomationRunsV2Hydrated } from "@/lib/automation-platform/durable-runs";
import { dispatchAutomationRuns } from "@/lib/automation-platform/execution/dispatch";
import {
  dbListActiveConditionAutomations,
  dbListRunsForAutomation,
} from "@/lib/automation-platform/repository/db-store";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import {
  buildFeatureAccessContext,
  isFeatureEnabled,
} from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";

import { decideConditionEdge } from "./edge";
import {
  evaluateConditionAutomation,
  type CalendarEventsFetcher,
} from "./evaluate";
import { buildConditionOccurrenceKey } from "./occurrence-key";
import {
  claimTriggerEvaluationLease,
  getTriggerState,
  releaseTriggerEvaluationLease,
  upsertTriggerState,
} from "./trigger-state-store";

const OPEN_RUN_STATUSES = new Set([
  "scheduled",
  "preparing",
  "awaiting_approval",
  "queued",
  "running",
  "retrying",
]);

export type ConditionTickResult = {
  scanned: number;
  evaluated: number;
  trueCount: number;
  falseCount: number;
  edges: number;
  enqueued: number;
  deduped: number;
  skippedLease: number;
  skippedOpenRun: number;
  evaluationFailed: number;
  dispatched: number;
  firings: Array<{
    automationId: string;
    userId: string;
    occurrenceKey: string;
    runId: string;
    resourceId: string;
    previousState: boolean | null;
    currentState: boolean;
    created: boolean;
    status: string;
  }>;
};

function triggerVersionFromAutomation(automation: {
  instruction: { structuredOptions: Record<string, unknown> };
}): number {
  const raw = automation.instruction.structuredOptions.conditionTriggerVersion;
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : 1;
}

async function hasOpenConditionRun(input: {
  userId: string;
  automationId: string;
}): Promise<boolean> {
  const runs = await dbListRunsForAutomation(input);
  return runs.some(
    (run) =>
      (run.triggerType === "condition" || run.triggerType === "event") &&
      OPEN_RUN_STATUSES.has(run.status),
  );
}

export async function processConditionAutomationsV2(options?: {
  nowMs?: number;
  limit?: number;
  dispatch?: boolean;
  hydrateUserIds?: string[];
  context?: FeatureAccessContext;
  calendarEventsFetcher?: CalendarEventsFetcher;
  owner?: string;
}): Promise<ConditionTickResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const context = options?.context ?? buildFeatureAccessContext(null);
  const owner = options?.owner ?? `condition-tick:${crypto.randomUUID()}`;
  const result: ConditionTickResult = {
    scanned: 0,
    evaluated: 0,
    trueCount: 0,
    falseCount: 0,
    edges: 0,
    enqueued: 0,
    deduped: 0,
    skippedLease: 0,
    skippedOpenRun: 0,
    evaluationFailed: 0,
    dispatched: 0,
    firings: [],
  };

  if (!isFeatureEnabled("automation_v2_enabled", context)) {
    return result;
  }

  for (const userId of options?.hydrateUserIds ?? []) {
    await ensureAutomationsV2Hydrated(userId);
    await ensureAutomationRunsV2Hydrated(userId);
  }

  const automations = await dbListActiveConditionAutomations(
    options?.limit ?? 50,
  );
  result.scanned = automations.length;
  const runIds: string[] = [];

  for (const automation of automations) {
    if (automation.status !== "active") continue;
    if (
      automation.trigger.type !== "condition" &&
      automation.trigger.type !== "event"
    ) {
      continue;
    }

    const claimed = await claimTriggerEvaluationLease({
      automationId: automation.id,
      userId: automation.userId,
      triggerType: automation.trigger.type,
      owner,
      nowMs,
    });
    if (!claimed) {
      result.skippedLease += 1;
      continue;
    }

    try {
      const evaluation = await evaluateConditionAutomation({
        automation,
        context,
        nowMs,
        calendarEventsFetcher: options?.calendarEventsFetcher,
      });

      if (!evaluation.evaluated) {
        result.evaluationFailed += 1;
        await upsertTriggerState({
          ...claimed,
          lastEvaluatedAt: new Date(nowMs).toISOString(),
          lastEvaluationError: `${evaluation.errorCode}:${evaluation.errorMessage}`,
          evaluationAttemptCount: claimed.evaluationAttemptCount + 1,
          evaluationLeaseOwner: null,
          evaluationLeaseUntil: null,
        });
        appendAutomationAudit({
          actorUserId: null,
          action: "automation.condition.evaluate",
          automationId: automation.id,
          runId: null,
          outcome: "error",
          errorCode: evaluation.errorCode,
          meta: {
            retryable: evaluation.retryable,
            message: evaluation.errorMessage,
            // evaluation failure must never start a workflow
            workflowStarted: false,
          },
        });
        continue;
      }

      result.evaluated += 1;
      if (evaluation.conditionState) result.trueCount += 1;
      else result.falseCount += 1;

      const openRunBlocks = await hasOpenConditionRun({
        userId: automation.userId,
        automationId: automation.id,
      });
      if (openRunBlocks && evaluation.conditionState) {
        result.skippedOpenRun += 1;
      }

      const edge = decideConditionEdge({
        previousState: claimed.lastConditionState,
        currentState: evaluation.conditionState,
        matchedResourceIds: evaluation.matchedResourceIds,
        alreadyTriggeredResourceIds: claimed.triggeredResourceIds,
        openRunBlocks,
      });

      appendAutomationAudit({
        actorUserId: null,
        action: "automation.condition.evaluate",
        automationId: automation.id,
        runId: null,
        outcome: "success",
        errorCode: null,
        meta: {
          previousState: claimed.lastConditionState,
          currentState: evaluation.conditionState,
          provider: evaluation.provider,
          eventType: evaluation.eventType,
          matchedResourceIds: evaluation.matchedResourceIds,
          edgeReason: edge.reason,
          shouldTrigger: edge.shouldTrigger,
        },
      });

      let nextState = {
        ...claimed,
        lastEvaluatedAt: evaluation.evidence.evaluatedAt,
        lastConditionState: evaluation.conditionState,
        lastEvaluationError: null,
        evaluationAttemptCount: 0,
        evaluationLeaseOwner: null as string | null,
        evaluationLeaseUntil: null as string | null,
        metadata: {
          ...claimed.metadata,
          lastEvidence: evaluation.evidence,
        },
      };

      if (!edge.shouldTrigger) {
        await upsertTriggerState(nextState);
        // Persist lightweight evaluation pointer on definition for cold-start UX.
        await persistAutomationV2Now({
          ...automation,
          instruction: {
            ...automation.instruction,
            structuredOptions: {
              ...automation.instruction.structuredOptions,
              conditionLastEvaluatedAt: evaluation.evidence.evaluatedAt,
              conditionLastState: evaluation.conditionState,
            },
          },
          updatedAt: new Date(nowMs).toISOString(),
        });
        continue;
      }

      result.edges += 1;
      const version = triggerVersionFromAutomation(automation);
      const occurrenceKey = buildConditionOccurrenceKey({
        automationId: automation.id,
        provider: evaluation.provider,
        eventType: evaluation.eventType,
        resourceId: edge.resourceId,
        triggerVersion: version,
      });

      const enqueued = await automationPlatformService.enqueueRun({
        userId: automation.userId,
        automationId: automation.id,
        triggerType: "condition",
        occurrenceKey,
        scheduledFor: evaluation.evidence.evaluatedAt,
        context,
        dispatch: false,
        conditionEvidence: {
          previousState: edge.previousState,
          currentState: edge.currentState,
          provider: evaluation.provider,
          eventType: evaluation.eventType,
          eventId: edge.resourceId,
          providerResourceId: edge.resourceId,
          conditionExpression: automation.trigger.condition?.expression ?? null,
          edgeReason: edge.reason,
        },
      });

      if (enqueued.created) {
        result.enqueued += 1;
        runIds.push(enqueued.run.id);
      } else {
        result.deduped += 1;
      }

      const triggeredIds = new Set(nextState.triggeredResourceIds);
      triggeredIds.add(edge.resourceId);
      nextState = {
        ...nextState,
        lastTriggeredAt: new Date(nowMs).toISOString(),
        lastOccurrenceKey: occurrenceKey,
        lastEventId: edge.resourceId,
        lastProviderResourceId: edge.resourceId,
        triggeredResourceIds: [...triggeredIds],
        triggerVersion: version,
      };
      await upsertTriggerState(nextState);

      await persistAutomationV2Now({
        ...automation,
        instruction: {
          ...automation.instruction,
          structuredOptions: {
            ...automation.instruction.structuredOptions,
            conditionLastEvaluatedAt: evaluation.evidence.evaluatedAt,
            conditionLastState: evaluation.conditionState,
            conditionLastOccurrenceKey: occurrenceKey,
            conditionLastEventId: edge.resourceId,
          },
        },
        updatedAt: new Date(nowMs).toISOString(),
      });

      result.firings.push({
        automationId: automation.id,
        userId: automation.userId,
        occurrenceKey,
        runId: enqueued.run.id,
        resourceId: edge.resourceId,
        previousState: edge.previousState,
        currentState: edge.currentState,
        created: enqueued.created,
        status: enqueued.run.status,
      });

      appendAutomationAudit({
        actorUserId: null,
        action: "automation.condition.fire",
        automationId: automation.id,
        runId: enqueued.run.id,
        outcome: "success",
        errorCode: enqueued.created ? null : "automation_duplicate_occurrence",
        meta: {
          occurrenceKey,
          resourceId: edge.resourceId,
          edgeReason: edge.reason,
          created: enqueued.created,
          runStatus: enqueued.run.status,
        },
      });
    } catch (error) {
      result.evaluationFailed += 1;
      const latest = (await getTriggerState(automation.id)) ?? claimed;
      await upsertTriggerState({
        ...latest,
        lastEvaluatedAt: new Date(nowMs).toISOString(),
        lastEvaluationError:
          error instanceof Error ? error.message.slice(0, 200) : "evaluate_failed",
        evaluationAttemptCount: latest.evaluationAttemptCount + 1,
        evaluationLeaseOwner: null,
        evaluationLeaseUntil: null,
      });
      appendAutomationAudit({
        actorUserId: null,
        action: "automation.condition.evaluate",
        automationId: automation.id,
        runId: null,
        outcome: "error",
        errorCode: "condition_evaluate_exception",
        meta: {
          message:
            error instanceof Error ? error.message.slice(0, 200) : "error",
          workflowStarted: false,
        },
      });
    } finally {
      await releaseTriggerEvaluationLease({
        automationId: automation.id,
        owner,
      }).catch(() => undefined);
    }
  }

  if (options?.dispatch !== false && runIds.length > 0) {
    const dispatched = await dispatchAutomationRuns({ runIds });
    result.dispatched = dispatched.processed;
  }

  return result;
}
