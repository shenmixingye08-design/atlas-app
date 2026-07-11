import "server-only";

import { generateDeliverables } from "@/lib/deliverables/engine";
import { uploadDeliverablesAfterGeneration } from "@/lib/integrations/deliverable-bridge";
import type { WorkflowRunTriggerType } from "@/lib/memory/types/workflow-run";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import { orchestrate } from "@/lib/orchestration/orchestrator";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";

import { previewFinalResponse } from "./domain";
import {
  buildCostOptimizationMetadata,
  buildSnsBatchAssignment,
  executionModeToCostSavingMode,
  resolveAutomationExecutionMode,
  shouldSkipRepeatedAiCalls,
} from "@/lib/cost-optimization";
import { recordCostRun } from "@/lib/cost-optimization/cost-savings-tracker";
import { recordUserAiUsage } from "@/lib/billing/usage/meter";
import {
  buildRequestCacheKey,
  getCachedOrchestrationResult,
  setCachedOrchestrationResult,
} from "@/lib/cost-optimization/request-cache";
import { saveScheduledPostDraft } from "@/lib/cost-optimization/scheduled-posts-store";
import {
  recordOpenAiFailureIfApplicable,
  recordXPostFailure,
} from "@/lib/owner/error-monitoring/telemetry";
import {
  recordPopularityFromOrchestration,
  recordPopularityFromWorkflowTemplate,
} from "@/lib/owner/popularity-ranking/telemetry";
import { recordCostFromOrchestration } from "@/lib/owner/cost-ranking/telemetry";
import { recordAnonymousUserActivity } from "@/lib/owner/anonymous-user-analysis/telemetry";
import {
  buildExecutionFlowContext,
  getEnabledStepIds,
  normalizeExecutionFlow,
} from "./execution-flow";
import { computeNextRunIso } from "./schedule";
import { buildCompanyOrchestrationMetadata } from "@/lib/company-templates/loader";
import { getServerActiveCompanyState } from "@/lib/company-templates/store";
import { maybeAutoPostToXAfterAutomation } from "@/lib/integrations/x/post/automation";
import {
  notifyAutomationAwaitingReview,
  notifyAutomationCompleted,
  notifyAutomationFailed,
} from "@/lib/notifications/emitters";
import type { Automation, AutomationRunResult } from "./types";
import { serverAutomationRepository } from "./repositories/server-automation-repository";
import { serverWorkflowRunRepository } from "./repositories/workflow-run-store";

export type ExecuteAutomationOptions = {
  triggerType?: WorkflowRunTriggerType;
  userId?: string | null;
  requestOrigin?: string;
};

/**
 * Runs one automation through the full Atlas pipeline:
 * orchestrate → deliverables → WorkflowRun history.
 * Does NOT duplicate AI logic — reuses existing modules.
 */
export async function executeAutomationRun(
  automation: Automation,
  options: ExecuteAutomationOptions = {},
): Promise<AutomationRunResult> {
  const triggerType = options.triggerType ?? "automation";
  const startedAt = new Date().toISOString();

  await serverAutomationRepository.update(automation.id, {
    status: "running",
    lastError: null,
  });

  const workflowRun = await serverWorkflowRunRepository.start({
    projectId: automation.id,
    userId: options.userId ?? null,
    assignment: automation.workflow.assignment,
    startedAt,
    automationId: automation.id,
    triggerType,
  });

  try {
    const executionFlow = normalizeExecutionFlow(automation.executionFlow);
    const flowContext = buildExecutionFlowContext(executionFlow);
    const executionMode = resolveAutomationExecutionMode(automation);
    const snsBatchDays =
      executionMode === "eco" ? automation.snsBatchDays : null;
    const baseAssignment = buildSnsBatchAssignment(
      automation.workflow.assignment,
      snsBatchDays,
    );
    const assignment = `${baseAssignment}\n\n${flowContext}`;

    const costMetadata = buildCostOptimizationMetadata({
      executionMode,
      snsBatchDays,
    });
    const cacheKey = buildRequestCacheKey(assignment, executionMode);

    let result = null as Awaited<ReturnType<typeof orchestrate>> | null;
    let servedFromRequestCache = false;

    if (shouldSkipRepeatedAiCalls(executionMode)) {
      const cached = getCachedOrchestrationResult(cacheKey);
      if (cached) {
        result = cached;
        servedFromRequestCache = true;
      }
    }

    if (!result) {
      result = await orchestrate({
        assignment,
        metadata: {
          ...buildCompanyOrchestrationMetadata(
            getServerActiveCompanyState().templateId,
          ),
          automationId: automation.id,
          automationName: automation.name,
          triggerType,
          ...(options.userId ? { userId: options.userId } : {}),
          executionFlow: {
            templateId: executionFlow.templateId,
            enabledStepIds: getEnabledStepIds(executionFlow),
          },
          ...costMetadata,
          salesMaterial: {
            costMode: executionModeToCostSavingMode(executionMode),
          },
          ...(automation.workflow.metadata ?? {}),
        },
      });

      if (executionMode !== "high_quality") {
        setCachedOrchestrationResult(cacheKey, result, executionMode);
      }
    }

    recordCostRun({
      executionMode,
      estimatedCostUsd: result.costDebug?.estimatedCostUsd ?? 0.001,
      fromCache: servedFromRequestCache,
      cacheHits:
        (result.costDebug?.cacheHits ?? 0) + (servedFromRequestCache ? 1 : 0),
    });

    if (servedFromRequestCache && result.status !== "failed") {
      if (options.userId) {
        recordUserAiUsage({
          userId: options.userId,
          api: "automation",
          feature: "content_writing",
          model: "cache",
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        });
      }
      recordCostFromOrchestration({
        assignment: automation.workflow.assignment,
        metadata: automation.workflow.metadata,
        deliverableType: result.deliverable?.type,
        userId: options.userId ?? null,
        costUsd: result.costDebug?.estimatedCostUsd ?? 0.001,
        durationMs: result.totalDurationMs,
        source: "automation",
      });
      recordAnonymousUserActivity({
        userId: options.userId ?? null,
        assignment: automation.workflow.assignment,
        metadata: automation.workflow.metadata,
        deliverableType: result.deliverable?.type,
        costUsd: result.costDebug?.estimatedCostUsd ?? 0.001,
        source: "automation",
      });
    }

    if (
      snsBatchDays &&
      result.status === "completed" &&
      result.finalResponse.trim()
    ) {
      saveScheduledPostDraft({
        automationId: automation.id,
        automationName: automation.name,
        batchDays: snsBatchDays,
        content: result.finalResponse,
      });
    }

    if (result.status === "completed" && result.finalResponse.trim()) {
      try {
        await maybeAutoPostToXAfterAutomation({
          userId: options.userId,
          automation,
          content: result.finalResponse,
        });
      } catch (postError) {
        console.error(
          `[executeAutomationRun] X auto-post failed for ${automation.id}:`,
          postError,
        );
      }
    }

    let deliverableCount = 0;

    if (
      result.status === "completed" &&
      getDeliverablePreviewText(result.deliverable) &&
      options.requestOrigin
    ) {
      try {
        const generated = await generateDeliverables(
          {
            assignment: automation.workflow.assignment,
            finalDeliverable: getDeliverablePreviewText(result.deliverable),
            title: automation.name,
          },
          options.requestOrigin,
        );
        deliverableCount = generated.deliverables.length;

        if (generated.deliverables.length > 0) {
          try {
            await uploadDeliverablesAfterGeneration({
              deliverables: generated.deliverables,
              projectName: automation.name,
              workflowId: workflowRun.id,
            });
          } catch (uploadError) {
            console.error(
              `[executeAutomationRun] Drive upload failed for ${automation.id}:`,
              uploadError,
            );
          }
        }
      } catch (deliverableError) {
        console.error(
          `[executeAutomationRun] Deliverables failed for ${automation.id}:`,
          deliverableError,
        );
      }
    }

    const preview = previewFinalResponse(result.finalResponse);
    const completedAt = new Date().toISOString();

    await serverWorkflowRunRepository.complete({
      id: workflowRun.id,
      status: result.status,
      approved: result.approved,
      totalDurationMs: result.totalDurationMs,
      result,
      finalResponsePreview: preview,
      error: result.error ?? null,
      completedAt,
    });

    const nextRun = computeNextRunIso(automation.schedule, new Date(completedAt));

    await serverAutomationRepository.update(automation.id, {
      status: result.status === "completed" ? "success" : "failed",
      lastRun: completedAt,
      nextRun,
      lastWorkflowRunId: workflowRun.id,
      lastError: result.error ?? null,
    });

    const flow = normalizeExecutionFlow(automation.executionFlow);
    if (result.status === "failed") {
      notifyAutomationFailed(options.userId, {
        automationId: automation.id,
        name: automation.name,
        error: result.error ?? undefined,
      });
    } else if (result.status === "completed" && !result.approved) {
      notifyAutomationAwaitingReview(options.userId, {
        automationId: automation.id,
        name: automation.name,
      });
    } else if (result.status === "completed") {
      notifyAutomationCompleted(options.userId, {
        automationId: automation.id,
        name: automation.name,
        templateId: flow.templateId,
      });
    }

    if (result.status === "failed") {
      recordOpenAiFailureIfApplicable(
        result.error ?? "Automation orchestration failed",
        "automation_run",
      );
      if (executionFlow.templateId === "sns_post") {
        recordXPostFailure(
          result.error ?? "SNS post automation failed",
          "automation_sns_post",
        );
      }
    } else {
      recordPopularityFromWorkflowTemplate({
        templateId: executionFlow.templateId,
        userId: options.userId ?? null,
      });
      recordPopularityFromOrchestration({
        assignment: automation.workflow.assignment,
        metadata: automation.workflow.metadata,
        deliverableType: result.deliverable?.type,
        userId: options.userId ?? null,
      });
      recordAnonymousUserActivity({
        userId: options.userId ?? null,
        assignment: automation.workflow.assignment,
        metadata: automation.workflow.metadata,
        deliverableType: result.deliverable?.type,
        costUsd: result.costDebug?.estimatedCostUsd ?? 0.01,
        source: "automation",
      });
    }

    return {
      automationId: automation.id,
      workflowRunId: workflowRun.id,
      status: result.status === "completed" ? "completed" : "failed",
      orchestrationStatus: result.status,
      approved: result.approved,
      totalDurationMs: result.totalDurationMs,
      finalResponsePreview: preview,
      error: result.error ?? null,
      deliverableCount,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Automation execution failed";
    recordOpenAiFailureIfApplicable(error, "automation_run");
    if (normalizeExecutionFlow(automation.executionFlow).templateId === "sns_post") {
      recordXPostFailure(message, "automation_sns_post");
    }
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(startedAt).getTime();

    const failedResult = {
      assignment: automation.workflow.assignment,
      status: "failed" as const,
      workflow: hydrateWorkflowState({ status: "failed" }),
      ceo: null,
      plannerPlan: null,
      plannerTasks: null,
      tasks: [],
      executions: [],
      deliverable: emptyDeliverable(),
      reviewComments: "",
      approved: false,
      finalResponse: "",
      totalDurationMs: durationMs,
      error: message,
    };

    await serverWorkflowRunRepository.complete({
      id: workflowRun.id,
      status: "failed",
      approved: false,
      totalDurationMs: durationMs,
      result: failedResult,
      finalResponsePreview: null,
      error: message,
      completedAt,
    });

    await serverAutomationRepository.update(automation.id, {
      status: "failed",
      lastRun: completedAt,
      nextRun: computeNextRunIso(automation.schedule, new Date(completedAt)),
      lastWorkflowRunId: workflowRun.id,
      lastError: message,
    });

    notifyAutomationFailed(options.userId, {
      automationId: automation.id,
      name: automation.name,
      error: message,
    });

    return {
      automationId: automation.id,
      workflowRunId: workflowRun.id,
      status: "failed",
      orchestrationStatus: "failed",
      approved: false,
      totalDurationMs: Date.now() - new Date(startedAt).getTime(),
      finalResponsePreview: null,
      error: message,
      deliverableCount: 0,
    };
  }
}
