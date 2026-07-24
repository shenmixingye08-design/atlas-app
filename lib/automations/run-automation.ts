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
import {
  maybeAutoPostToXAfterAutomation,
  resolveTweetTextForPublish,
} from "@/lib/integrations/x/post/automation";
import {
  notifyAutomationAwaitingReview,
  notifyAutomationCompleted,
  notifyAutomationFailed,
  notifyXRecurringPostFailed,
  notifyXRecurringPostSuccess,
} from "@/lib/notifications/emitters";
import type { Automation, AutomationRunHistoryEntry, AutomationRunResult } from "./types";
import { serverAutomationRepository } from "./repositories/server-automation-repository";
import { MAX_AUTOMATION_RUN_HISTORY } from "./repositories/server-automation-repository";
import { serverWorkflowRunRepository } from "./repositories/workflow-run-store";
import {
  recordAutomationExecutionLog,
  updateAutomationExecutionLog,
} from "./execution-log";
import {
  shouldAutoPublishToX,
  shouldAwaitXPostApproval,
} from "./x-recurring/destination";
import { getXRecurringError } from "./x-recurring/errors";
import { hasRecurringSlotAlreadyHandled } from "./x-recurring/idempotency";
import { savePendingXPost } from "./x-recurring/pending-store";
import { gateXRecurringConnection } from "./x-recurring/connection-gate";
import { resolveFeatureContextForUser } from "@/lib/integrations/x/post/drive-backup";

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

function mapXPostFailureCode(message: string | null | undefined): string {
  const text = (message ?? "").toLowerCase();
  if (!message?.trim()) return "internal_error";
  if (/未連携|接続してください|xを接続/.test(message)) return "x_not_connected";
  if (/再連携/.test(message)) return "x_reconnect_required";
  if (/権限|scope|tweet\.write/.test(text)) return "x_permission_missing";
  if (/rate|制限/.test(text)) return "x_rate_limited";
  if (/長すぎ|too long|280/.test(text)) return "x_text_too_long";
  if (/空|empty/.test(text)) return "x_text_empty";
  if (/refresh|トークン/.test(text)) return "x_refresh_failed";
  if (/auth|401|403/.test(text)) return "x_auth_failed";
  if (/limit|上限/.test(text)) return "x_post_limit";
  return "internal_error";
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
    let snsErrorCode: string | null = null;
    let xPostId: string | null = null;
    let xPostUrl: string | null = null;
    let awaitingXApproval = false;
    let generatedTweetText = "";
    const scheduledAt = automation.nextRun ?? startedAt;

    const executionLog = recordAutomationExecutionLog({
      automationId: automation.id,
      userId: options.userId ?? automation.userId,
      scheduledAt,
      startedAt,
      completedAt: null,
      status: "running",
      generatedText: null,
      xPostId: null,
      xPostUrl: null,
      errorCode: null,
      errorMessage: null,
      retryCount: 0,
      xApiSummary: null,
      triggerType,
    });

    if (result.status === "completed") {
      generatedTweetText = resolveTweetTextForPublish({
        deliverable: result.deliverable,
        finalResponse: result.finalResponse,
      });

      const wantsX =
        shouldAutoPublishToX(automation) || shouldAwaitXPostApproval(automation);

      if (wantsX && options.userId) {
        if (
          hasRecurringSlotAlreadyHandled({
            userId: options.userId,
            automationId: automation.id,
            scheduledAt,
          })
        ) {
          snsPostFailure = getXRecurringError("duplicate_execution").message;
          snsErrorCode = "duplicate_execution";
        } else if (!generatedTweetText.trim()) {
          snsPostFailure = getXRecurringError("x_text_empty").message;
          snsErrorCode = "x_text_empty";
        } else {
          try {
            const context = await resolveFeatureContextForUser(options.userId);
            const gate = await gateXRecurringConnection({
              userId: options.userId,
              context,
            });

            if (!gate.ok) {
              snsPostFailure = gate.error.message;
              snsErrorCode = gate.error.code;
            } else if (shouldAwaitXPostApproval(automation)) {
              savePendingXPost({
                automationId: automation.id,
                userId: options.userId,
                scheduledAt,
                generatedText: generatedTweetText,
                accountUsername: gate.username,
              });
              awaitingXApproval = true;
            } else if (shouldAutoPublishToX(automation)) {
              const autoPost = await maybeAutoPostToXAfterAutomation({
                userId: options.userId,
                automation,
                content: generatedTweetText,
                context,
                allowPublish: true,
              });

              if (autoPost.attempted && autoPost.mode === "publish") {
                const postResult = autoPost.result;
                if (postResult.status !== "ready") {
                  snsPostFailure = postResult.message;
                  snsErrorCode = mapXPostFailureCode(postResult.message);
                } else if (postResult.history?.status !== "success") {
                  snsPostFailure =
                    postResult.history?.errorMessage ??
                    "Xへの投稿に失敗しました";
                  snsErrorCode = mapXPostFailureCode(snsPostFailure);
                } else {
                  xPostId = postResult.history.tweetId ?? null;
                  xPostUrl = postResult.history.tweetUrl ?? null;
                }
              } else if (!autoPost.attempted) {
                snsPostFailure =
                  "Xへの投稿処理を開始できませんでした。投稿先設定をご確認ください。";
                snsErrorCode = "internal_error";
              }
            }
          } catch (postError) {
            console.error(
              `[executeAutomationRun] X auto-post failed for ${automation.id}:`,
              postError instanceof Error ? postError.name : "unknown",
            );
            snsPostFailure =
              postError instanceof Error
                ? postError.message
                : getXRecurringError("internal_error").message;
            snsErrorCode = mapXPostFailureCode(snsPostFailure);
          }
        }
      } else if (result.finalResponse.trim()) {
        // Legacy SNS flows without destination=x still use the previous path.
        try {
          const autoPost = await maybeAutoPostToXAfterAutomation({
            userId: options.userId,
            automation,
            content: generatedTweetText || result.finalResponse,
          });

          if (autoPost.attempted && autoPost.mode === "publish") {
            const postResult = autoPost.result;
            if (postResult.status !== "ready") {
              snsPostFailure = postResult.message;
              snsErrorCode = mapXPostFailureCode(postResult.message);
            } else if (postResult.history?.status !== "success") {
              snsPostFailure =
                postResult.history?.errorMessage ?? "Xへの投稿に失敗しました";
              snsErrorCode = mapXPostFailureCode(snsPostFailure);
            } else {
              xPostId = postResult.history.tweetId ?? null;
              xPostUrl = postResult.history.tweetUrl ?? null;
            }
          }
        } catch (postError) {
          console.error(
            `[executeAutomationRun] X auto-post failed for ${automation.id}:`,
            postError instanceof Error ? postError.name : "unknown",
          );
          snsPostFailure =
            postError instanceof Error
              ? postError.message
              : "Xへの投稿に失敗しました";
          snsErrorCode = mapXPostFailureCode(snsPostFailure);
        }
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

    const preview = previewFinalResponse(
      generatedTweetText || result.finalResponse,
    );
    const completedAt = new Date().toISOString();

    // A completed orchestration whose SNS publish failed must be surfaced as a
    // failure — otherwise the user sees "投稿完了" while nothing reached X.
    // Approval-wait is a successful run that intentionally did not post yet.
    const effectiveStatus: "completed" | "failed" | "awaiting_approval" =
      snsPostFailure && result.status === "completed"
        ? "failed"
        : awaitingXApproval && result.status === "completed"
          ? "awaiting_approval"
          : result.status === "completed"
            ? "completed"
            : "failed";
    const effectiveError = snsPostFailure ?? result.error ?? null;

    await serverWorkflowRunRepository.complete({
      id: workflowRun.id,
      status:
        effectiveStatus === "awaiting_approval" ? "completed" : effectiveStatus,
      approved:
        effectiveStatus === "completed" && result.approved && !snsPostFailure,
      totalDurationMs: result.totalDurationMs,
      result,
      finalResponsePreview: preview,
      error: effectiveError,
      completedAt,
    });

    const nextRun = computeNextRunIso(automation.schedule, new Date(completedAt));
    const succeeded = effectiveStatus === "completed";
    const awaiting = effectiveStatus === "awaiting_approval";
    const latest = await serverAutomationRepository.findById(automation.id);

    await serverAutomationRepository.update(automation.id, {
      status: succeeded || awaiting ? "success" : "failed",
      lastRun: completedAt,
      nextRun,
      lastWorkflowRunId: workflowRun.id,
      lastError: effectiveError,
      successCount:
        (latest?.successCount ?? automation.successCount ?? 0) +
        (succeeded ? 1 : 0),
      failureCount:
        (latest?.failureCount ?? automation.failureCount ?? 0) +
        (succeeded || awaiting ? 0 : 1),
      runHistory: appendRunHistory(latest?.runHistory ?? automation.runHistory, {
        id: workflowRun.id,
        status: awaiting
          ? "awaiting_approval"
          : succeeded
            ? "completed"
            : "failed",
        startedAt,
        completedAt,
        error: effectiveError,
        triggerType,
        scheduledAt,
        generatedText: generatedTweetText || null,
        xPostId,
        xPostUrl,
        errorCode: snsErrorCode,
        retryCount: 0,
      }),
    });

    updateAutomationExecutionLog(executionLog.id, {
      completedAt,
      status: awaiting
        ? "awaiting_approval"
        : succeeded
          ? "success"
          : "failed",
      generatedText: generatedTweetText || null,
      xPostId,
      xPostUrl,
      errorCode: snsErrorCode,
      errorMessage: effectiveError,
      xApiSummary: xPostId
        ? `posted tweetId=${xPostId}`
        : awaiting
          ? "awaiting_user_approval"
          : snsErrorCode
            ? `error=${snsErrorCode}`
            : null,
    });

    const flow = normalizeExecutionFlow(automation.executionFlow);
    if (effectiveStatus === "failed") {
      if (shouldAutoPublishToX(automation) || shouldAwaitXPostApproval(automation)) {
        notifyXRecurringPostFailed(options.userId, {
          automationId: automation.id,
          executionId: workflowRun.id,
          errorMessage: effectiveError ?? undefined,
        });
      } else {
        notifyAutomationFailed(options.userId, {
          automationId: automation.id,
          name: automation.name,
          error: effectiveError ?? undefined,
        });
      }
    } else if (awaiting) {
      notifyAutomationAwaitingReview(options.userId, {
        automationId: automation.id,
        name: automation.name,
      });
    } else if (effectiveStatus === "completed" && xPostId) {
      notifyXRecurringPostSuccess(options.userId, {
        automationId: automation.id,
        executionId: workflowRun.id,
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
      status:
        effectiveStatus === "awaiting_approval"
          ? "awaiting_approval"
          : effectiveStatus === "completed"
            ? "completed"
            : "failed",
      orchestrationStatus: result.status,
      approved:
        effectiveStatus === "completed" && result.approved && !snsPostFailure,
      totalDurationMs: result.totalDurationMs,
      finalResponsePreview: preview,
      error: effectiveError,
      deliverableCount,
      xPostId,
      xPostUrl,
      errorCode: snsErrorCode,
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
