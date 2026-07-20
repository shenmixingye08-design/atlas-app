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
import type { Automation, AutomationRunHistoryEntry, AutomationRunResult } from "./types";
import { serverAutomationRepository } from "./repositories/server-automation-repository";
import { MAX_AUTOMATION_RUN_HISTORY } from "./repositories/server-automation-repository";
import { serverWorkflowRunRepository } from "./repositories/workflow-run-store";

export type ExecuteAutomationOptions = {
  triggerType?: WorkflowRunTriggerType;
  userId?: string | null;
  requestOrigin?: string;
};

function appendRunHistory(
  existing: AutomationRunHistoryEntry[] | undefined,
  entry: AutomationRunHistoryEntry,
): AutomationRunHistoryEntry[] {
  return [entry, ...(existing ?? [])].slice(0, MAX_AUTOMATION_RUN_HISTORY);
}

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

    // Tracks a real SNS publish failure so we never report "投稿完了" when
    // nothing actually reached X. Holds the user-facing reason on failure.
    let snsPostFailure: string | null = null;

    if (result.status === "completed" && result.finalResponse.trim()) {
      try {
        const autoPost = await maybeAutoPostToXAfterAutomation({
          userId: options.userId,
          automation,
          content: result.finalResponse,
        });

        // Only immediate "publish" posts hit X during this run; a "schedule"
        // result is a successful reservation, not a completed post.
        if (autoPost.attempted && autoPost.mode === "publish") {
          const postResult = autoPost.result;
          if (postResult.status !== "ready") {
            snsPostFailure = postResult.message;
          } else if (postResult.history?.status !== "success") {
            snsPostFailure =
              postResult.history?.errorMessage ?? "Xへの投稿に失敗しました";
          }
        }
      } catch (postError) {
        console.error(
          `[executeAutomationRun] X auto-post failed for ${automation.id}:`,
          postError,
        );
        snsPostFailure =
          postError instanceof Error
            ? postError.message
            : "Xへの投稿に失敗しました";
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

    // A completed orchestration whose SNS publish failed must be surfaced as a
    // failure — otherwise the user sees "投稿完了" while nothing reached X.
    const effectiveStatus: typeof result.status =
      snsPostFailure && result.status === "completed" ? "failed" : result.status;
    const effectiveError = snsPostFailure ?? result.error ?? null;

    await serverWorkflowRunRepository.complete({
      id: workflowRun.id,
      status: effectiveStatus,
      approved: result.approved && !snsPostFailure,
      totalDurationMs: result.totalDurationMs,
      result,
      finalResponsePreview: preview,
      error: effectiveError,
      completedAt,
    });

    const nextRun = computeNextRunIso(automation.schedule, new Date(completedAt));
    const succeeded = effectiveStatus === "completed";
    const latest = await serverAutomationRepository.findById(automation.id);

    await serverAutomationRepository.update(automation.id, {
      status: succeeded ? "success" : "failed",
      lastRun: completedAt,
      nextRun,
      lastWorkflowRunId: workflowRun.id,
      lastError: effectiveError,
      successCount: (latest?.successCount ?? automation.successCount ?? 0) + (succeeded ? 1 : 0),
      failureCount: (latest?.failureCount ?? automation.failureCount ?? 0) + (succeeded ? 0 : 1),
      runHistory: appendRunHistory(latest?.runHistory ?? automation.runHistory, {
        id: workflowRun.id,
        status: succeeded ? "completed" : "failed",
        startedAt,
        completedAt,
        error: effectiveError,
        triggerType,
      }),
    });

    const flow = normalizeExecutionFlow(automation.executionFlow);
    if (effectiveStatus === "failed") {
      notifyAutomationFailed(options.userId, {
        automationId: automation.id,
        name: automation.name,
        error: effectiveError ?? undefined,
      });
    } else if (effectiveStatus === "completed" && !result.approved) {
      notifyAutomationAwaitingReview(options.userId, {
        automationId: automation.id,
        name: automation.name,
      });
    } else if (effectiveStatus === "completed") {
      notifyAutomationCompleted(options.userId, {
        automationId: automation.id,
        name: automation.name,
        templateId: flow.templateId,
      });
    }

    if (effectiveStatus === "failed") {
      recordOpenAiFailureIfApplicable(
        effectiveError ?? "Automation orchestration failed",
        "automation_run",
      );
      const { recordMonitoringIncident } = await import(
        "@/lib/owner/monitoring"
      );
      recordMonitoringIncident({
        kind: "automation_failure",
        targetId: "automation",
        message: effectiveError ?? "Automation orchestration failed",
        userId: options.userId ?? null,
        critical: true,
        source: "automation_run",
      });
      if (executionFlow.templateId === "sns_post") {
        recordXPostFailure(
          effectiveError ?? "SNS post automation failed",
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
      status: effectiveStatus === "completed" ? "completed" : "failed",
      orchestrationStatus: result.status,
      approved: result.approved && !snsPostFailure,
      totalDurationMs: result.totalDurationMs,
      finalResponsePreview: preview,
      error: effectiveError,
      deliverableCount,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Automation execution failed";
    recordOpenAiFailureIfApplicable(error, "automation_run");
    const { recordMonitoringIncident } = await import(
      "@/lib/owner/monitoring"
    );
    recordMonitoringIncident({
      kind: "automation_failure",
      targetId: "automation",
      message,
      userId: options.userId ?? null,
      critical: true,
      source: "automation_run",
    });
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

    const latest = await serverAutomationRepository.findById(automation.id);
    await serverAutomationRepository.update(automation.id, {
      status: "failed",
      lastRun: completedAt,
      nextRun: computeNextRunIso(automation.schedule, new Date(completedAt)),
      lastWorkflowRunId: workflowRun.id,
      lastError: message,
      failureCount: (latest?.failureCount ?? automation.failureCount ?? 0) + 1,
      runHistory: appendRunHistory(latest?.runHistory ?? automation.runHistory, {
        id: workflowRun.id,
        status: "failed",
        startedAt,
        completedAt,
        error: message,
        triggerType,
      }),
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
