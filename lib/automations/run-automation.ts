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
  applyExternalPublishIntent,
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
  notifyAutomationStarted,
} from "@/lib/notifications/emitters";
import { recordAutomationExecutionLog } from "./execution-log";
import {
  AUTOMATION_MAX_ATTEMPTS,
  isFinalAutomationAttempt,
  retryBackoffMs,
  shouldRetryAutomationAttempt,
} from "./retry-policy";
import { describeLastRunResult } from "./execution-status";
import type {
  Automation,
  AutomationRunArtifacts,
  AutomationRunHistoryEntry,
  AutomationRunResult,
} from "./types";
import { serverAutomationRepository } from "./repositories/server-automation-repository";
import { MAX_AUTOMATION_RUN_HISTORY } from "./repositories/server-automation-repository";
import { serverWorkflowRunRepository } from "./repositories/workflow-run-store";

export type ExecuteAutomationOptions = {
  triggerType?: WorkflowRunTriggerType;
  userId?: string | null;
  requestOrigin?: string;
};

type AttemptOutcome = {
  workflowRunId: string;
  status: "completed" | "failed";
  orchestrationStatus: "completed" | "failed";
  approved: boolean;
  totalDurationMs: number;
  finalResponsePreview: string | null;
  error: string | null;
  deliverableCount: number;
  artifacts: AutomationRunArtifacts | null;
  actions: string[];
  apisUsed: string[];
  startedAt: string;
  completedAt: string;
};

function appendRunHistory(
  existing: AutomationRunHistoryEntry[] | undefined,
  entry: AutomationRunHistoryEntry,
): AutomationRunHistoryEntry[] {
  return [entry, ...(existing ?? [])].slice(0, MAX_AUTOMATION_RUN_HISTORY);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildResultSummary(outcome: AttemptOutcome): string {
  if (outcome.status === "completed") {
    if (outcome.artifacts?.tweetUrl) {
      return `完了 · 投稿URL: ${outcome.artifacts.tweetUrl}`;
    }
    if (outcome.finalResponsePreview) {
      return `完了 · ${outcome.finalResponsePreview.slice(0, 120)}`;
    }
    return "完了しました";
  }
  return outcome.error?.trim() || "失敗しました";
}

/**
 * Single orchestration attempt for one automation.
 * Retries are handled by {@link executeAutomationRun}.
 */
async function runAutomationAttempt(
  automation: Automation,
  options: ExecuteAutomationOptions,
  attempt: number,
): Promise<AttemptOutcome> {
  const triggerType = options.triggerType ?? "automation";
  const startedAt = new Date().toISOString();
  const actions: string[] = [];
  const apisUsed: string[] = [];

  await serverAutomationRepository.update(automation.id, {
    status: attempt > 1 ? "retrying" : "running",
    currentAttempt: attempt,
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
    const executionFlow = applyExternalPublishIntent(
      normalizeExecutionFlow(automation.executionFlow),
      `${automation.name} ${automation.workflow.assignment}`,
    );
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
        actions.push("キャッシュから結果を再利用");
        apisUsed.push("request_cache");
      }
    }

    if (!result) {
      actions.push("AIエージェント起動");
      actions.push(`ワークフロー実行（${executionFlow.templateId}）`);
      apisUsed.push("openai");
      result = await orchestrate({
        assignment,
        metadata: {
          ...buildCompanyOrchestrationMetadata(
            getServerActiveCompanyState().templateId,
          ),
          automationId: automation.id,
          automationName: automation.name,
          triggerType,
          attempt,
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
      actions.push("文章・成果物を生成");
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
      actions.push(`SNS ${snsBatchDays}日分の予約下書きを保存`);
    }

    let snsPostFailure: string | null = null;
    let artifacts: AutomationRunArtifacts | null = null;

    const publishText =
      resolveTweetTextForPublish({
        deliverable: result.deliverable,
        finalResponse: result.finalResponse,
      }) || result.finalResponse.trim();

    if (result.status === "completed" && publishText) {
      try {
        const autoPost = await maybeAutoPostToXAfterAutomation({
          userId: options.userId,
          automation: { ...automation, executionFlow },
          content: publishText,
        });

        if (autoPost.attempted && autoPost.mode === "publish") {
          actions.push("X APIへ投稿");
          apisUsed.push("x_api");
          const postResult = autoPost.result;
          if (postResult.status !== "ready") {
            snsPostFailure = postResult.message;
          } else if (postResult.history?.status !== "success") {
            snsPostFailure =
              postResult.history?.errorMessage ?? "Xへの投稿に失敗しました";
          } else {
            artifacts = {
              tweetUrl: postResult.history.tweetUrl,
              tweetId: postResult.history.tweetId,
              preview: publishText.slice(0, 160),
            };
            actions.push("投稿URL取得");
            actions.push("投稿成功を確認");
          }
        } else if (autoPost.attempted && autoPost.mode === "schedule") {
          actions.push("X投稿を予約");
          apisUsed.push("x_api");
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
        apisUsed.push("x_api");
        actions.push("X投稿に失敗");
      }
    }

    let deliverableCount = 0;

    if (
      result.status === "completed" &&
      getDeliverablePreviewText(result.deliverable) &&
      options.requestOrigin
    ) {
      try {
        actions.push("成果物ファイルを生成");
        apisUsed.push("deliverables");
        const generated = await generateDeliverables(
          {
            assignment: automation.workflow.assignment,
            finalDeliverable: getDeliverablePreviewText(result.deliverable),
            title: automation.name,
          },
          options.requestOrigin,
        );
        deliverableCount = generated.deliverables.length;
        artifacts = {
          ...(artifacts ?? {}),
          deliverableCount,
          preview:
            artifacts?.preview ??
            previewFinalResponse(result.finalResponse, 160),
        };

        if (generated.deliverables.length > 0) {
          try {
            await uploadDeliverablesAfterGeneration({
              deliverables: generated.deliverables,
              projectName: automation.name,
              workflowId: workflowRun.id,
            });
            actions.push("成果物をクラウドへ保存");
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
    const effectiveStatus: typeof result.status =
      snsPostFailure && result.status === "completed" ? "failed" : result.status;
    const effectiveError = snsPostFailure ?? result.error ?? null;

    if (effectiveStatus === "completed") {
      actions.push("完了");
    }

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

    if (effectiveStatus === "failed") {
      recordOpenAiFailureIfApplicable(
        effectiveError ?? "Automation orchestration failed",
        "automation_run",
      );
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
      workflowRunId: workflowRun.id,
      status: effectiveStatus === "completed" ? "completed" : "failed",
      orchestrationStatus: result.status,
      approved: result.approved && !snsPostFailure,
      totalDurationMs: result.totalDurationMs,
      finalResponsePreview: preview,
      error: effectiveError,
      deliverableCount,
      artifacts,
      actions,
      apisUsed: [...new Set(apisUsed)],
      startedAt,
      completedAt,
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
    actions.push("実行中に例外が発生");

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

    return {
      workflowRunId: workflowRun.id,
      status: "failed",
      orchestrationStatus: "failed",
      approved: false,
      totalDurationMs: durationMs,
      finalResponsePreview: null,
      error: message,
      deliverableCount: 0,
      artifacts: null,
      actions,
      apisUsed: [...new Set(apisUsed.length > 0 ? apisUsed : ["openai"])],
      startedAt,
      completedAt,
    };
  }
}

/**
 * Runs one automation through the full Atlas pipeline with up to 3 attempts:
 * orchestrate → deliverables → optional X publish → WorkflowRun history.
 * Does NOT duplicate AI logic — reuses existing modules.
 */
export async function executeAutomationRun(
  automation: Automation,
  options: ExecuteAutomationOptions = {},
): Promise<AutomationRunResult> {
  const triggerType = options.triggerType ?? "automation";
  const runStartedAt = new Date().toISOString();

  notifyAutomationStarted(options.userId, {
    automationId: automation.id,
    name: automation.name,
  });

  let lastOutcome: AttemptOutcome | null = null;

  for (let attempt = 1; attempt <= AUTOMATION_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await serverAutomationRepository.update(automation.id, {
        status: "retrying",
        currentAttempt: attempt,
        lastError: lastOutcome?.error ?? null,
        lastResultSummary: `リトライ中（${attempt}/${AUTOMATION_MAX_ATTEMPTS}）`,
      });
      await sleep(retryBackoffMs(attempt - 1));
    } else {
      await serverAutomationRepository.update(automation.id, {
        status: "running",
        currentAttempt: 1,
        lastError: null,
        lastResultSummary: "AI秘書が現在仕事を進めています",
      });
    }

    lastOutcome = await runAutomationAttempt(automation, options, attempt);

    const historyEntry: AutomationRunHistoryEntry = {
      id: lastOutcome.workflowRunId,
      status: lastOutcome.status,
      startedAt: lastOutcome.startedAt,
      completedAt: lastOutcome.completedAt,
      durationMs: lastOutcome.totalDurationMs,
      error: lastOutcome.error,
      triggerType,
      attempt,
      deliverablePreview: lastOutcome.finalResponsePreview,
      artifacts: lastOutcome.artifacts,
      actions: lastOutcome.actions,
      apisUsed: lastOutcome.apisUsed,
    };

    const latest = await serverAutomationRepository.findById(automation.id);
    const nextHistory = appendRunHistory(
      latest?.runHistory ?? automation.runHistory,
      historyEntry,
    );

    recordAutomationExecutionLog({
      userId: options.userId ?? automation.userId ?? null,
      automationId: automation.id,
      automationName: automation.name,
      workflowRunId: lastOutcome.workflowRunId,
      triggerType,
      status: lastOutcome.status,
      attempt,
      startedAt: lastOutcome.startedAt,
      completedAt: lastOutcome.completedAt,
      durationMs: lastOutcome.totalDurationMs,
      actions: lastOutcome.actions,
      apisUsed: lastOutcome.apisUsed,
      templateId: normalizeExecutionFlow(automation.executionFlow).templateId,
      error: lastOutcome.error,
      artifactUrls: [
        lastOutcome.artifacts?.tweetUrl,
      ].filter((url): url is string => Boolean(url)),
    });

    const succeeded = lastOutcome.status === "completed";

    if (succeeded || !shouldRetryAutomationAttempt(attempt, succeeded)) {
      const completedAt = lastOutcome.completedAt;
      const nextRun = computeNextRunIso(automation.schedule, new Date(completedAt));
      const resultSummary = buildResultSummary(lastOutcome);

      await serverAutomationRepository.update(automation.id, {
        status: succeeded ? "success" : "failed",
        lastRun: completedAt,
        nextRun,
        lastWorkflowRunId: lastOutcome.workflowRunId,
        lastError: lastOutcome.error,
        lastResultSummary: resultSummary,
        currentAttempt: attempt,
        successCount:
          (latest?.successCount ?? automation.successCount ?? 0) +
          (succeeded ? 1 : 0),
        failureCount:
          (latest?.failureCount ?? automation.failureCount ?? 0) +
          (succeeded ? 0 : 1),
        runHistory: nextHistory,
      });

      if (!succeeded) {
        const { recordMonitoringIncident } = await import(
          "@/lib/owner/monitoring"
        );
        recordMonitoringIncident({
          kind: "automation_failure",
          targetId: "automation",
          message: lastOutcome.error ?? "Automation orchestration failed",
          userId: options.userId ?? null,
          critical: true,
          source: "automation_run",
        });
        // Notify only after all retries are exhausted.
        if (isFinalAutomationAttempt(attempt) || !shouldRetryAutomationAttempt(attempt, false)) {
          notifyAutomationFailed(options.userId, {
            automationId: automation.id,
            name: automation.name,
            error: lastOutcome.error ?? undefined,
          });
        }
      } else {
        const flow = normalizeExecutionFlow(automation.executionFlow);
        if (!lastOutcome.approved) {
          notifyAutomationAwaitingReview(options.userId, {
            automationId: automation.id,
            name: automation.name,
          });
        } else {
          notifyAutomationCompleted(options.userId, {
            automationId: automation.id,
            name: automation.name,
            templateId: flow.templateId,
            tweetUrl: lastOutcome.artifacts?.tweetUrl,
          });
        }
      }

      return {
        automationId: automation.id,
        workflowRunId: lastOutcome.workflowRunId,
        status: succeeded ? "completed" : "failed",
        orchestrationStatus: lastOutcome.orchestrationStatus,
        approved: lastOutcome.approved,
        totalDurationMs: Date.now() - new Date(runStartedAt).getTime(),
        finalResponsePreview: lastOutcome.finalResponsePreview,
        error: lastOutcome.error,
        deliverableCount: lastOutcome.deliverableCount,
        attempt,
        artifacts: lastOutcome.artifacts,
        actions: lastOutcome.actions,
        apisUsed: lastOutcome.apisUsed,
      };
    }

    // Persist intermediate retry state before next attempt.
    await serverAutomationRepository.update(automation.id, {
      status: "retrying",
      currentAttempt: attempt,
      lastError: lastOutcome.error,
      lastResultSummary: `リトライ中（${attempt + 1}/${AUTOMATION_MAX_ATTEMPTS}）`,
      lastWorkflowRunId: lastOutcome.workflowRunId,
      runHistory: nextHistory,
    });
  }

  // Unreachable — loop always returns — keep TypeScript satisfied.
  const fallbackError = lastOutcome?.error ?? "Automation execution failed";
  return {
    automationId: automation.id,
    workflowRunId: lastOutcome?.workflowRunId ?? automation.id,
    status: "failed",
    orchestrationStatus: "failed",
    approved: false,
    totalDurationMs: Date.now() - new Date(runStartedAt).getTime(),
    finalResponsePreview: null,
    error: fallbackError,
    deliverableCount: 0,
    attempt: AUTOMATION_MAX_ATTEMPTS,
    artifacts: null,
    actions: lastOutcome?.actions ?? [],
    apisUsed: lastOutcome?.apisUsed ?? [],
  };
}

/** @internal test helper */
export function __testDescribeLastRunResult(
  automation: Parameters<typeof describeLastRunResult>[0],
) {
  return describeLastRunResult(automation);
}
