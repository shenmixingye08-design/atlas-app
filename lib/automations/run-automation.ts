import "server-only";

import { recordUserAiUsage } from "@/lib/billing/usage/meter";
import { buildCompanyOrchestrationMetadata } from "@/lib/company-templates/loader";
import { getServerActiveCompanyState } from "@/lib/company-templates/store";
import {
  buildCostOptimizationMetadata,
  buildSnsBatchAssignment,
  executionModeToCostSavingMode,
  resolveAutomationExecutionMode,
  shouldSkipRepeatedAiCalls,
} from "@/lib/cost-optimization";
import { recordCostRun } from "@/lib/cost-optimization/cost-savings-tracker";
import {
  buildRequestCacheKey,
  getCachedOrchestrationResult,
  setCachedOrchestrationResult,
} from "@/lib/cost-optimization/request-cache";
import { saveScheduledPostDraft } from "@/lib/cost-optimization/scheduled-posts-store";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { uploadDeliverablesAfterGeneration } from "@/lib/integrations/deliverable-bridge";
import {
  maybeAutoPostToXAfterAutomation,
  resolveTweetTextForPublish,
} from "@/lib/integrations/x/post/automation";
import type { WorkflowRunTriggerType } from "@/lib/memory/types/workflow-run";
import {
  emptyDeliverable,
  getDeliverablePreviewText,
} from "@/lib/orchestration/deliverable-types";
import { orchestrate } from "@/lib/orchestration/orchestrator";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import { recordAnonymousUserActivity } from "@/lib/owner/anonymous-user-analysis/telemetry";
import { recordCostFromOrchestration } from "@/lib/owner/cost-ranking/telemetry";
import {
  recordOpenAiFailureIfApplicable,
  recordXPostFailure,
} from "@/lib/owner/error-monitoring/telemetry";
import {
  recordPopularityFromOrchestration,
  recordPopularityFromWorkflowTemplate,
} from "@/lib/owner/popularity-ranking/telemetry";
import {
  notifyAutomationAwaitingReview,
  notifyAutomationCompleted,
  notifyAutomationFailed,
  notifyAutomationRetry,
  notifyAutomationStarted,
} from "@/lib/notifications/emitters";

import { previewFinalResponse } from "./domain";
import {
  applyExternalPublishIntent,
  buildExecutionFlowContext,
  getEnabledStepIds,
  normalizeExecutionFlow,
} from "./execution-flow";
import { recordAutomationExecutionLog } from "./execution-log";
import { describeLastRunResult } from "./execution-status";
import { serverAutomationRepository } from "./repositories/server-automation-repository";
import { MAX_AUTOMATION_RUN_HISTORY } from "./repositories/server-automation-repository";
import { serverWorkflowRunRepository } from "./repositories/workflow-run-store";
import {
  AUTOMATION_MAX_ATTEMPTS,
  formatRetryDelay,
  isFinalAutomationAttempt,
  nextRetryAtIso,
  shouldRetryAutomationAttempt,
} from "./retry-policy";
import { computeNextRunAfterSuccessIso } from "./schedule";
import type {
  Automation,
  AutomationDebugStage,
  AutomationRunArtifacts,
  AutomationRunHistoryEntry,
  AutomationRunResult,
} from "./types";

export type ExecuteAutomationOptions = {
  triggerType?: WorkflowRunTriggerType;
  userId?: string | null;
  requestOrigin?: string;
  /** Continue a deferred retry (1-based). Defaults to 1 for fresh runs. */
  attempt?: number;
  /** Skip the start notification (already sent on first attempt). */
  skipStartNotification?: boolean;
};

type AttemptOutcome = {
  workflowRunId: string;
  status: "completed" | "failed";
  orchestrationStatus: "completed" | "failed";
  approved: boolean;
  totalDurationMs: number;
  finalResponsePreview: string | null;
  deliverablePreview: string | null;
  generatedContent: string | null;
  error: string | null;
  deliverableCount: number;
  artifacts: AutomationRunArtifacts | null;
  actions: string[];
  apisUsed: string[];
  startedAt: string;
  completedAt: string;
  stoppedAtStage: AutomationDebugStage;
  aiRan: boolean;
  xApiCalled: boolean;
};

function appendRunHistory(
  existing: AutomationRunHistoryEntry[] | undefined,
  entry: AutomationRunHistoryEntry,
): AutomationRunHistoryEntry[] {
  return [entry, ...(existing ?? [])].slice(0, MAX_AUTOMATION_RUN_HISTORY);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function getAutomationUserId(
  automation: Automation,
  options: ExecuteAutomationOptions,
): string | null {
  return options.userId ?? automation.userId ?? null;
}

function isOneShotAutomation(automation: Automation): boolean {
  return (
    automation.schedule.kind === "schedule" &&
    automation.schedule.preset.type === "once"
  );
}

function normalizeAttempt(attempt?: number): number {
  if (!Number.isFinite(attempt)) return 1;
  return Math.min(
    AUTOMATION_MAX_ATTEMPTS,
    Math.max(1, Math.floor(attempt ?? 1)),
  );
}

function buildResultSummary(outcome: AttemptOutcome): string {
  if (outcome.status === "completed") {
    if (outcome.artifacts?.tweetUrl) {
      return `成功 · 投稿URL: ${outcome.artifacts.tweetUrl}`;
    }
    if (outcome.finalResponsePreview) {
      return `成功 · ${outcome.finalResponsePreview.slice(0, 120)}`;
    }
    return "成功しました";
  }
  return outcome.error?.trim() || "失敗しました";
}

function buildHistoryEntry(
  outcome: AttemptOutcome,
  triggerType: WorkflowRunTriggerType,
  attempt: number,
  status: AutomationRunHistoryEntry["status"] = outcome.status,
): AutomationRunHistoryEntry {
  return {
    id: outcome.workflowRunId,
    status,
    startedAt: outcome.startedAt,
    completedAt: outcome.completedAt,
    durationMs: outcome.totalDurationMs,
    error: outcome.error,
    triggerType,
    attempt,
    deliverablePreview: outcome.deliverablePreview,
    generatedContent: outcome.generatedContent,
    artifacts: outcome.artifacts,
    actions: outcome.actions,
    apisUsed: outcome.apisUsed,
    stoppedAtStage: outcome.stoppedAtStage,
  };
}

function artifactUrls(artifacts: AutomationRunArtifacts | null): string[] {
  return [artifacts?.tweetUrl].filter((url): url is string => Boolean(url));
}

async function recordExecutionEvent(input: {
  automation: Automation;
  options: ExecuteAutomationOptions;
  triggerType: WorkflowRunTriggerType;
  event: "started" | "completed" | "failed" | "retry_scheduled";
  status: "completed" | "failed" | "retrying" | "running";
  attempt: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  workflowRunId: string | null;
  actions: string[];
  apisUsed: string[];
  templateId: string | null;
  error: string | null;
  artifacts: AutomationRunArtifacts | null;
  generatedContent: string | null;
  aiRan: boolean;
  xApiCalled: boolean;
  stoppedAtStage: AutomationDebugStage | null;
  nextRetryAt: string | null;
}) {
  await recordAutomationExecutionLog({
    userId: getAutomationUserId(input.automation, input.options),
    automationId: input.automation.id,
    automationName: input.automation.name,
    workflowRunId: input.workflowRunId,
    triggerType: input.triggerType,
    event: input.event,
    status: input.status,
    attempt: input.attempt,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    actions: input.actions,
    apisUsed: input.apisUsed,
    templateId: input.templateId,
    error: input.error,
    artifactUrls: artifactUrls(input.artifacts),
    tweetUrl: input.artifacts?.tweetUrl ?? null,
    tweetId: input.artifacts?.tweetId ?? null,
    generatedContent: input.generatedContent,
    aiRan: input.aiRan,
    xApiCalled: input.xApiCalled,
    stoppedAtStage: input.stoppedAtStage,
    nextRetryAt: input.nextRetryAt,
  });
}

function createFailedResult(input: {
  automation: Automation;
  durationMs: number;
  message: string;
}) {
  return {
    assignment: input.automation.workflow.assignment,
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
    totalDurationMs: input.durationMs,
    error: input.message,
  };
}

/**
 * Single orchestration attempt for one automation.
 * Deferred retry scheduling is handled by {@link executeAutomationRun}.
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
  let stoppedAtStage: AutomationDebugStage = "started";
  let aiRan = false;
  let xApiCalled = false;

  const executionFlow = applyExternalPublishIntent(
    normalizeExecutionFlow(automation.executionFlow),
    `${automation.name} ${automation.workflow.assignment}`,
  );
  const templateId = executionFlow.templateId;

  await serverAutomationRepository.update(automation.id, {
    status: attempt > 1 ? "retrying" : "running",
    currentAttempt: attempt,
    nextRetryAt: null,
    lastError: null,
    lastResultSummary:
      attempt > 1
        ? `リトライ中（試行${attempt}/${AUTOMATION_MAX_ATTEMPTS}）`
        : "AI秘書が現在仕事を進めています",
  });

  const workflowRun = await serverWorkflowRunRepository.start({
    projectId: automation.id,
    userId: getAutomationUserId(automation, options),
    assignment: automation.workflow.assignment,
    startedAt,
    automationId: automation.id,
    triggerType,
  });

  await recordExecutionEvent({
    automation,
    options,
    triggerType,
    event: "started",
    status: "running",
    attempt,
    startedAt,
    completedAt: null,
    durationMs: null,
    workflowRunId: workflowRun.id,
    actions,
    apisUsed,
    templateId,
    error: null,
    artifacts: null,
    generatedContent: null,
    aiRan,
    xApiCalled,
    stoppedAtStage,
    nextRetryAt: null,
  });

  try {
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
        stoppedAtStage = "ai_cached";
        actions.push("キャッシュから結果を再利用");
        apisUsed.push("request_cache");
      }
    }

    if (!result) {
      stoppedAtStage = "ai_started";
      aiRan = true;
      actions.push("AI秘書が起動");
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
          ...(getAutomationUserId(automation, options)
            ? { userId: getAutomationUserId(automation, options) }
            : {}),
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

      stoppedAtStage = "ai_completed";
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
      const userId = getAutomationUserId(automation, options);
      if (userId) {
        recordUserAiUsage({
          userId,
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
        userId,
        costUsd: result.costDebug?.estimatedCostUsd ?? 0.001,
        durationMs: result.totalDurationMs,
        source: "automation",
      });
      recordAnonymousUserActivity({
        userId,
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
          userId: getAutomationUserId(automation, options),
          automation: { ...automation, executionFlow },
          content: publishText,
        });

        if (autoPost.attempted) {
          stoppedAtStage = "x_api";
          xApiCalled = true;
          apisUsed.push("x_api");

          if (autoPost.mode === "publish") {
            actions.push("X APIへ投稿");
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
          } else {
            actions.push("X投稿を予約");
          }
        }
      } catch (postError) {
        stoppedAtStage = "x_api";
        xApiCalled = true;
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
        stoppedAtStage = "deliverables";
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

    const deliverableText = getDeliverablePreviewText(result.deliverable);
    const deliverablePreview = deliverableText
      ? previewFinalResponse(deliverableText, 240)
      : null;
    const finalResponsePreview = previewFinalResponse(result.finalResponse);
    const generatedContent = result.finalResponse.trim()
      ? previewFinalResponse(result.finalResponse, 800)
      : null;
    const completedAt = new Date().toISOString();
    const effectiveStatus: typeof result.status =
      snsPostFailure && result.status === "completed" ? "failed" : result.status;
    const effectiveError = snsPostFailure ?? result.error ?? null;

    if (effectiveStatus === "completed") {
      stoppedAtStage = "completed";
      actions.push("完了");
    } else if (stoppedAtStage !== "x_api") {
      stoppedAtStage = "failed";
    }

    await serverWorkflowRunRepository.complete({
      id: workflowRun.id,
      status: effectiveStatus,
      approved: result.approved && !snsPostFailure,
      totalDurationMs: result.totalDurationMs,
      result,
      finalResponsePreview,
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
      const userId = getAutomationUserId(automation, options);
      recordPopularityFromWorkflowTemplate({
        templateId: executionFlow.templateId,
        userId,
      });
      recordPopularityFromOrchestration({
        assignment: automation.workflow.assignment,
        metadata: automation.workflow.metadata,
        deliverableType: result.deliverable?.type,
        userId,
      });
      recordAnonymousUserActivity({
        userId,
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
      finalResponsePreview,
      deliverablePreview,
      generatedContent,
      error: effectiveError,
      deliverableCount,
      artifacts,
      actions,
      apisUsed: uniqueStrings(apisUsed),
      startedAt,
      completedAt,
      stoppedAtStage,
      aiRan,
      xApiCalled,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Automation execution failed";
    recordOpenAiFailureIfApplicable(error, "automation_run");
    if (templateId === "sns_post") {
      recordXPostFailure(message, "automation_sns_post");
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(startedAt).getTime();
    const failedStage =
      stoppedAtStage === "x_api" ? stoppedAtStage : ("failed" as const);
    actions.push("実行中に例外が発生");

    await serverWorkflowRunRepository.complete({
      id: workflowRun.id,
      status: "failed",
      approved: false,
      totalDurationMs: durationMs,
      result: createFailedResult({
        automation,
        durationMs,
        message,
      }),
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
      deliverablePreview: null,
      generatedContent: null,
      error: message,
      deliverableCount: 0,
      artifacts: null,
      actions,
      apisUsed: uniqueStrings(apisUsed.length > 0 ? apisUsed : ["openai"]),
      startedAt,
      completedAt,
      stoppedAtStage: failedStage,
      aiRan,
      xApiCalled,
    };
  }
}

async function recordFinalFailureIncident(input: {
  automation: Automation;
  options: ExecuteAutomationOptions;
  outcome: AttemptOutcome;
}) {
  const { recordMonitoringIncident } = await import("@/lib/owner/monitoring");
  recordMonitoringIncident({
    kind: "automation_failure",
    targetId: "automation",
    message: input.outcome.error ?? "Automation orchestration failed",
    userId: getAutomationUserId(input.automation, input.options),
    critical: true,
    source: "automation_run",
  });
}

/**
 * Runs exactly one automation attempt.
 * Failed attempts schedule deferred retries through `nextRetryAt`; no inline sleeps.
 */
export async function executeAutomationRun(
  automation: Automation,
  options: ExecuteAutomationOptions = {},
): Promise<AutomationRunResult> {
  const triggerType = options.triggerType ?? "automation";
  const attempt = normalizeAttempt(options.attempt);
  const runStartedAt = new Date().toISOString();
  const templateId = normalizeExecutionFlow(automation.executionFlow).templateId;

  if (!options.skipStartNotification) {
    notifyAutomationStarted(getAutomationUserId(automation, options), {
      automationId: automation.id,
      name: automation.name,
    });
  }

  const outcome = await runAutomationAttempt(automation, options, attempt);
  const latest = await serverAutomationRepository.findById(automation.id);
  const baseHistory = latest?.runHistory ?? automation.runHistory;
  const succeeded = outcome.status === "completed";
  const shouldRetry = shouldRetryAutomationAttempt(attempt, succeeded);

  if (succeeded) {
    const nextRun = computeNextRunAfterSuccessIso(
      automation.schedule,
      new Date(outcome.completedAt),
    );
    const historyEntry = buildHistoryEntry(outcome, triggerType, attempt);
    const nextHistory = appendRunHistory(baseHistory, historyEntry);
    const oneShot = isOneShotAutomation(automation);

    await serverAutomationRepository.update(automation.id, {
      status: "success",
      enabled: oneShot ? false : latest?.enabled ?? automation.enabled,
      lastRun: outcome.completedAt,
      nextRun,
      nextRetryAt: null,
      activeSlotKey: null,
      lastWorkflowRunId: outcome.workflowRunId,
      lastError: null,
      lastResultSummary: buildResultSummary(outcome),
      currentAttempt: attempt,
      successCount: (latest?.successCount ?? automation.successCount ?? 0) + 1,
      failureCount: latest?.failureCount ?? automation.failureCount ?? 0,
      runHistory: nextHistory,
    });

    await recordExecutionEvent({
      automation,
      options,
      triggerType,
      event: "completed",
      status: "completed",
      attempt,
      startedAt: outcome.startedAt,
      completedAt: outcome.completedAt,
      durationMs: outcome.totalDurationMs,
      workflowRunId: outcome.workflowRunId,
      actions: outcome.actions,
      apisUsed: outcome.apisUsed,
      templateId,
      error: null,
      artifacts: outcome.artifacts,
      generatedContent: outcome.generatedContent,
      aiRan: outcome.aiRan,
      xApiCalled: outcome.xApiCalled,
      stoppedAtStage: outcome.stoppedAtStage,
      nextRetryAt: null,
    });

    if (!outcome.approved) {
      notifyAutomationAwaitingReview(getAutomationUserId(automation, options), {
        automationId: automation.id,
        name: automation.name,
      });
    } else {
      notifyAutomationCompleted(getAutomationUserId(automation, options), {
        automationId: automation.id,
        name: automation.name,
        templateId,
        tweetUrl: outcome.artifacts?.tweetUrl,
      });
    }

    return {
      automationId: automation.id,
      workflowRunId: outcome.workflowRunId,
      status: "completed",
      orchestrationStatus: outcome.orchestrationStatus,
      approved: outcome.approved,
      totalDurationMs: Date.now() - new Date(runStartedAt).getTime(),
      finalResponsePreview: outcome.finalResponsePreview,
      error: outcome.error,
      deliverableCount: outcome.deliverableCount,
      attempt,
      artifacts: outcome.artifacts,
      actions: outcome.actions,
      apisUsed: outcome.apisUsed,
      nextRetryAt: null,
      stoppedAtStage: outcome.stoppedAtStage,
      generatedContent: outcome.generatedContent,
    };
  }

  if (shouldRetry && !isFinalAutomationAttempt(attempt)) {
    const nextRetryAt = nextRetryAtIso(attempt, new Date(outcome.completedAt));
    const historyEntry = buildHistoryEntry(
      {
        ...outcome,
        stoppedAtStage: "retry_scheduled",
      },
      triggerType,
      attempt,
      "retrying",
    );
    const nextHistory = appendRunHistory(baseHistory, historyEntry);
    const delayLabel = formatRetryDelay(attempt);

    await serverAutomationRepository.update(automation.id, {
      status: "retrying",
      nextRetryAt,
      activeSlotKey: latest?.activeSlotKey ?? automation.activeSlotKey,
      lastWorkflowRunId: outcome.workflowRunId,
      lastError: outcome.error,
      lastResultSummary: `リトライを予約しました（${delayLabel}）`,
      currentAttempt: attempt,
      runHistory: nextHistory,
    });

    await recordExecutionEvent({
      automation,
      options,
      triggerType,
      event: "retry_scheduled",
      status: "retrying",
      attempt,
      startedAt: outcome.startedAt,
      completedAt: outcome.completedAt,
      durationMs: outcome.totalDurationMs,
      workflowRunId: outcome.workflowRunId,
      actions: outcome.actions,
      apisUsed: outcome.apisUsed,
      templateId,
      error: outcome.error,
      artifacts: outcome.artifacts,
      generatedContent: outcome.generatedContent,
      aiRan: outcome.aiRan,
      xApiCalled: outcome.xApiCalled,
      stoppedAtStage: "retry_scheduled",
      nextRetryAt,
    });

    notifyAutomationRetry(getAutomationUserId(automation, options), {
      automationId: automation.id,
      name: automation.name,
      attempt: attempt + 1,
      nextRetryAt,
      error: outcome.error ?? undefined,
      delayLabel,
    });

    return {
      automationId: automation.id,
      workflowRunId: outcome.workflowRunId,
      status: "retrying",
      orchestrationStatus: outcome.orchestrationStatus,
      approved: false,
      totalDurationMs: Date.now() - new Date(runStartedAt).getTime(),
      finalResponsePreview: outcome.finalResponsePreview,
      error: outcome.error,
      deliverableCount: outcome.deliverableCount,
      attempt,
      artifacts: outcome.artifacts,
      actions: outcome.actions,
      apisUsed: outcome.apisUsed,
      nextRetryAt,
      stoppedAtStage: "retry_scheduled",
      generatedContent: outcome.generatedContent,
    };
  }

  const nextRun = computeNextRunAfterSuccessIso(
    automation.schedule,
    new Date(outcome.completedAt),
  );
  const historyEntry = buildHistoryEntry(outcome, triggerType, attempt);
  const nextHistory = appendRunHistory(baseHistory, historyEntry);
  const oneShot = isOneShotAutomation(automation);

  await serverAutomationRepository.update(automation.id, {
    status: "failed",
    enabled: oneShot ? false : latest?.enabled ?? automation.enabled,
    lastRun: outcome.completedAt,
    nextRun,
    nextRetryAt: null,
    activeSlotKey: null,
    lastWorkflowRunId: outcome.workflowRunId,
    lastError: outcome.error,
    lastResultSummary: buildResultSummary(outcome),
    currentAttempt: attempt,
    successCount: latest?.successCount ?? automation.successCount ?? 0,
    failureCount: (latest?.failureCount ?? automation.failureCount ?? 0) + 1,
    runHistory: nextHistory,
  });

  await recordExecutionEvent({
    automation,
    options,
    triggerType,
    event: "failed",
    status: "failed",
    attempt,
    startedAt: outcome.startedAt,
    completedAt: outcome.completedAt,
    durationMs: outcome.totalDurationMs,
    workflowRunId: outcome.workflowRunId,
    actions: outcome.actions,
    apisUsed: outcome.apisUsed,
    templateId,
    error: outcome.error,
    artifacts: outcome.artifacts,
    generatedContent: outcome.generatedContent,
    aiRan: outcome.aiRan,
    xApiCalled: outcome.xApiCalled,
    stoppedAtStage: outcome.stoppedAtStage,
    nextRetryAt: null,
  });

  await recordFinalFailureIncident({ automation, options, outcome });

  notifyAutomationFailed(getAutomationUserId(automation, options), {
    automationId: automation.id,
    name: automation.name,
    error: outcome.error ?? undefined,
  });

  return {
    automationId: automation.id,
    workflowRunId: outcome.workflowRunId,
    status: "failed",
    orchestrationStatus: outcome.orchestrationStatus,
    approved: false,
    totalDurationMs: Date.now() - new Date(runStartedAt).getTime(),
    finalResponsePreview: outcome.finalResponsePreview,
    error: outcome.error,
    deliverableCount: outcome.deliverableCount,
    attempt,
    artifacts: outcome.artifacts,
    actions: outcome.actions,
    apisUsed: outcome.apisUsed,
    nextRetryAt: null,
    stoppedAtStage: outcome.stoppedAtStage,
    generatedContent: outcome.generatedContent,
  };
}

/** @internal test helper */
export function __testDescribeLastRunResult(
  automation: Parameters<typeof describeLastRunResult>[0],
) {
  return describeLastRunResult(automation);
}
