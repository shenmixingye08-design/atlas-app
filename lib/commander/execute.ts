import "server-only";

import { createDefaultExecutionFlow } from "@/lib/automations/execution-flow";
import { buildExecutionFlowContext } from "@/lib/automations/execution-flow";
import { serverWorkflowRunRepository } from "@/lib/automations/repositories/workflow-run-store";
import {
  deliverableHasContent,
  emptyDeliverable,
  getDeliverablePreviewText,
} from "@/lib/orchestration/deliverable-types";
import { runOrchestrationForUser } from "@/lib/orchestration/run-for-user";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import {
  notifyAutomationAwaitingReview,
  notifyWorkCompleted,
  notifyWorkFailed,
} from "@/lib/notifications/emitters";
import { runLearningAnalysis } from "@/lib/learning-engine/service";
import { detectMemorySignals } from "@/lib/work-memory/learning";
import { createWorkMemoryCandidate } from "@/lib/work-memory/service";
import { maybeAutoPostToXAfterCommander } from "@/lib/integrations/x/post/automation";

import { isRecurringAssignment } from "./classify";
import {
  evaluateCommanderConfirmation,
  isRememberHabitAssignment,
} from "./confirmation";
import { persistCommanderResultAsProject } from "./durable-store";
import { buildCommanderPlan, COMMANDER_MAX_RETRIES } from "./plan";
import {
  createCommanderRun,
  getCommanderRun,
  isCommanderCancelRequested,
  requestCommanderCancel,
  updateCommanderRun,
} from "./run-store";
import type {
  CommanderAttemptRecord,
  CommanderCompletionReport,
  CommanderPlan,
  CommanderRunResult,
  CommanderRunStatus,
} from "./types";

async function runExternalPreflightParallel(
  plan: CommanderPlan,
): Promise<{ ok: boolean; messages: string[] }> {
  const messages = await Promise.all(
    plan.requiredExternalServices.map(async (service) => {
      if (!service.required) {
        return `${service.label}: 任意（${service.connectionStatus}）`;
      }
      if (
        service.connectionStatus === "connected" ||
        service.connectionStatus === "pending"
      ) {
        return `${service.label}: 接続済み`;
      }
      return `${service.label}: 未接続（要設定）`;
    }),
  );

  const ok = plan.requiredExternalServices
    .filter((service) => service.required)
    .every(
      (service) =>
        service.connectionStatus === "connected" ||
        service.connectionStatus === "pending",
    );

  return { ok, messages };
}

function buildReport(input: {
  status: CommanderRunStatus;
  plan: CommanderPlan;
  result: OrchestrationResult | null;
  attempts: CommanderAttemptRecord[];
  externalMessages: string[];
  confirmationReasons: string[];
}): CommanderCompletionReport {
  const retriesUsed = Math.max(0, input.attempts.length - 1);
  const titles: Record<CommanderRunStatus, string> = {
    planning: "実行計画",
    awaiting_confirmation: "実行前確認が必要です",
    running: "実行中",
    partial: "一部完了報告",
    completed: "完了報告",
    failed: "失敗報告",
    cancelled: "中止報告",
  };

  let summary = "";
  switch (input.status) {
    case "awaiting_confirmation":
      summary = `重要操作のため確認待ちです。${input.confirmationReasons.join(" / ")}`;
      break;
    case "partial":
      summary = `一部の成果は得られましたが完全には完了しませんでした。${input.result?.error ?? ""}`;
      break;
    case "completed":
      summary = `「${input.plan.classification.summary}」を既存AIパイプラインで完了しました。`;
      break;
    case "cancelled":
      summary = "ユーザー操作により実行を中止しました。";
      break;
    case "failed":
      summary = `実行に失敗しました（試行 ${input.attempts.length} 回）。${input.result?.error ?? input.attempts.at(-1)?.error ?? ""}`;
      break;
    default:
      summary = "司令塔が計画を準備しています。";
  }

  return {
    status: input.status,
    title: titles[input.status],
    summary,
    classification: input.plan.classification.summary,
    aisUsed: input.plan.requiredAis.map((ai) => `${ai.name}（${ai.role}）`),
    externalServices: input.externalMessages,
    templateLabel: input.plan.requiredTemplate.label,
    memoryUsedCount: input.plan.requiredMemory.workMemoryIds.length,
    attempts: input.attempts.length,
    retriesUsed,
    projectHint: "結果はプロジェクト履歴へ保存できます",
    automationHint: isRecurringAssignment(input.plan.assignment)
      ? "定期依頼のため「任せている仕事」への登録を推奨します"
      : null,
    confirmationReasons: input.confirmationReasons,
  };
}

function toRunResult(input: {
  runId: string | null;
  status: CommanderRunStatus;
  plan: CommanderPlan;
  result: OrchestrationResult | null;
  attempts: CommanderAttemptRecord[];
  confirmationReasons: string[];
  externalMessages: string[];
  workMemory?: OrchestrationResult["workMemory"];
  workMemoryCandidates?: unknown[];
}): CommanderRunResult {
  return {
    runId: input.runId,
    status: input.status,
    plan: input.plan,
    result: input.result,
    report: buildReport({
      status: input.status,
      plan: input.plan,
      result: input.result,
      attempts: input.attempts,
      externalMessages: input.externalMessages,
      confirmationReasons: input.confirmationReasons,
    }),
    attempts: input.attempts,
    confirmationReasons: input.confirmationReasons,
    ...(input.workMemory && { workMemory: input.workMemory }),
    ...(input.workMemoryCandidates &&
      input.workMemoryCandidates.length > 0 && {
        workMemoryCandidates: input.workMemoryCandidates,
      }),
  };
}

async function executeRememberHabitRun(input: {
  runId: string;
  userId: string;
  plan: CommanderPlan;
  confirmationReasons: string[];
  externalMessages: string[];
}): Promise<CommanderRunResult> {
  updateCommanderRun(input.runId, input.userId, { status: "running" });

  const signals = detectMemorySignals({ assignment: input.plan.assignment });
  const habitSignals = signals.filter((signal) => signal.type === "habit");
  const toSave =
    habitSignals.length > 0
      ? habitSignals
      : [
          {
            trigger: "explicit_save" as const,
            type: "habit" as const,
            title: "定期作業の習慣候補",
            summary: input.plan.assignment.slice(0, 200),
            structuredData: {
              cadenceHint: "weekly",
              scheduleNotEnabled: true,
              note: "定期実行は未設定です。任せている仕事で確認してください。",
            },
            sourceType: "user_explicit" as const,
            confidence: 0.85,
            reason: "ユーザーが習慣として覚えるよう依頼しました",
          },
        ];

  const candidates = toSave
    .map((signal) => createWorkMemoryCandidate(input.userId, signal))
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );

  const summary =
    `習慣候補を ${candidates.length} 件作成しました。` +
    `定期実行はまだ開始していません。覚えた仕事で確認・保存し、必要なら「任せている仕事」でスケジュールを設定してください。`;

  const syntheticResult: OrchestrationResult = {
    assignment: input.plan.assignment,
    status: "completed",
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: emptyDeliverable("document"),
    reviewComments: "",
    approved: true,
    finalResponse: summary,
    totalDurationMs: 0,
    workMemoryCandidates: candidates,
  };

  updateCommanderRun(input.runId, input.userId, {
    status: "completed",
    result: syntheticResult,
    attempts: [
      {
        attempt: 1,
        status: "completed",
        error: null,
        durationMs: 0,
      },
    ],
  });

  const habitProjectId = `commander-${input.runId}`;
  await persistCommanderResultAsProject({
    userId: input.userId,
    assignment: input.plan.assignment,
    result: syntheticResult,
    projectId: habitProjectId,
  });

  notifyWorkCompleted(input.userId, {
    title: "習慣候補を作成しました",
    message: summary,
    actionUrl: `/projects/${encodeURIComponent(habitProjectId)}`,
    relatedTaskId: habitProjectId,
  });

  return toRunResult({
    runId: input.runId,
    status: "completed",
    plan: input.plan,
    result: syntheticResult,
    attempts: [
      {
        attempt: 1,
        status: "completed",
        error: null,
        durationMs: 0,
      },
    ],
    confirmationReasons: input.confirmationReasons,
    externalMessages: input.externalMessages,
    workMemoryCandidates: candidates,
  });
}

async function executeStoredRun(input: {
  runId: string;
  userId: string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<CommanderRunResult> {
  const run = getCommanderRun(input.runId, input.userId);
  if (!run) {
    throw new Error("Commander run not found");
  }

  const plan = run.plan;
  const external = await runExternalPreflightParallel(plan);

  if (isRememberHabitAssignment(plan.assignment)) {
    return executeRememberHabitRun({
      runId: input.runId,
      userId: input.userId,
      plan,
      confirmationReasons: run.confirmationReasons,
      externalMessages: external.messages,
    });
  }

  if (!external.ok) {
    const blocked = updateCommanderRun(input.runId, input.userId, {
      status: "awaiting_confirmation",
      confirmationReasons: [
        ...run.confirmationReasons,
        "必須の外部サービスが未接続のため実行できません",
      ],
      error: "Required external services are disconnected",
    });
    notifyAutomationAwaitingReview(input.userId, {
      automationId: input.runId,
      name: "外部サービス未接続の依頼",
    });
    return toRunResult({
      runId: input.runId,
      status: "awaiting_confirmation",
      plan,
      result: null,
      attempts: run.attempts,
      confirmationReasons: blocked?.confirmationReasons ?? run.confirmationReasons,
      externalMessages: external.messages,
    });
  }

  updateCommanderRun(input.runId, input.userId, {
    status: "running",
    error: null,
  });

  const workflowRun = await serverWorkflowRunRepository.start({
    projectId: `commander:${input.runId}`,
    userId: input.userId,
    assignment: plan.assignment,
    automationId: null,
    triggerType: "manual",
  });
  updateCommanderRun(input.runId, input.userId, {
    workflowRunId: workflowRun.id,
  });

  const flow = createDefaultExecutionFlow(plan.classification.templateId);
  const flowContext = buildExecutionFlowContext(flow);
  const assignment = `${plan.assignment}\n\n${flowContext}`;

  const attempts: CommanderAttemptRecord[] = [...run.attempts];
  let lastResult: OrchestrationResult | null = null;
  let workMemory: OrchestrationResult["workMemory"] | undefined;
  let workMemoryCandidates: unknown[] | undefined;
  let finalStatus: CommanderRunStatus = "failed";

  const maxAttempts = COMMANDER_MAX_RETRIES + 1;

  for (let attempt = attempts.length + 1; attempt <= maxAttempts; attempt += 1) {
    if (isCommanderCancelRequested(input.runId, input.userId)) {
      finalStatus = "cancelled";
      attempts.push({
        attempt,
        status: "cancelled",
        error: "Cancelled by user",
        durationMs: 0,
      });
      break;
    }

    const started = Date.now();
    try {
      const orchestration = await runOrchestrationForUser({
        assignment,
        userId: input.userId,
        metadata: {
          ...(input.metadata ?? {}),
          commander: true,
          commanderRunId: input.runId,
          commanderAttempt: attempt,
          commanderTemplateId: plan.requiredTemplate.templateId,
          selectedEmployeeIds: plan.requiredAis.map((ai) => ai.employeeId),
        },
        notify: false,
        recordLearning: true,
      });

      lastResult = orchestration.result;
      workMemory = orchestration.workMemory;
      workMemoryCandidates = orchestration.workMemoryCandidates;

      if (orchestration.result.status === "completed") {
        attempts.push({
          attempt,
          status: "completed",
          error: null,
          durationMs: Date.now() - started,
        });
        finalStatus = "completed";
        break;
      }

      const partial =
        orchestration.result.deliverable != null &&
        deliverableHasContent(orchestration.result.deliverable);

      attempts.push({
        attempt,
        status: partial ? "partial" : "failed",
        error: orchestration.result.error ?? "Orchestration failed",
        durationMs: Date.now() - started,
      });

      if (partial && attempt >= maxAttempts) {
        finalStatus = "partial";
        break;
      }
      if (partial && attempt < maxAttempts) {
        // One more retry for partial; if last retry keep partial.
        continue;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Commander execution failed";
      attempts.push({
        attempt,
        status: "failed",
        error: message,
        durationMs: Date.now() - started,
      });
      lastResult = null;
    }
  }

  // Actually publish to X for one-off SNS post requests. Orchestration only
  // prepares the copy (the「投稿」step is skipped in flow context), so without
  // this the run reports「完了」while nothing ever reaches X.
  let snsPublishReason: string | null = null;
  let snsPublishedTweetUrl: string | null = null;
  if (finalStatus === "completed" && lastResult) {
    try {
      const autoPost = await maybeAutoPostToXAfterCommander({
        userId: input.userId,
        templateId: flow.templateId,
        assignment: plan.assignment,
        deliverable: lastResult.deliverable,
        finalResponse: lastResult.finalResponse,
      });
      if (autoPost.attempted && autoPost.mode === "publish") {
        const postResult = autoPost.result;
        if (postResult.status !== "ready") {
          snsPublishReason = postResult.message;
        } else if (postResult.history?.status !== "success") {
          snsPublishReason =
            postResult.history?.errorMessage ?? "Xへの投稿に失敗しました";
        } else {
          snsPublishedTweetUrl = postResult.history?.tweetUrl ?? null;
        }
      }
    } catch (error) {
      snsPublishReason =
        error instanceof Error ? error.message : "Xへの投稿に失敗しました";
    }

    // A prepared-but-not-posted SNS run must not report a clean「完了」.
    if (snsPublishReason) {
      finalStatus = "partial";
      if (lastResult) {
        lastResult = { ...lastResult, error: snsPublishReason };
      }
    }
  }

  // Persist full attempt list
  updateCommanderRun(input.runId, input.userId, {
    attempts,
    result: lastResult,
    status: finalStatus,
    error: lastResult?.error ?? attempts.at(-1)?.error ?? null,
  });

  const preview =
    lastResult?.finalResponse?.slice(0, 280) ??
    (lastResult?.deliverable
      ? getDeliverablePreviewText(lastResult.deliverable).slice(0, 280)
      : null);

  await serverWorkflowRunRepository.complete({
    id: workflowRun.id,
    status:
      finalStatus === "completed" || finalStatus === "partial"
        ? "completed"
        : "failed",
    approved: finalStatus === "completed",
    totalDurationMs: attempts.reduce((sum, item) => sum + item.durationMs, 0),
    result:
      lastResult ??
      ({
        assignment: plan.assignment,
        status: "failed",
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
        totalDurationMs: attempts.reduce((sum, item) => sum + item.durationMs, 0),
        error: attempts.at(-1)?.error ?? "Commander failed",
      } satisfies OrchestrationResult),
    finalResponsePreview: preview,
    error:
      finalStatus === "failed" || finalStatus === "cancelled"
        ? attempts.at(-1)?.error ?? null
        : null,
  });

  // Deterministic id shared by the server persist, the client save, and the
  // notification deep link so「結果を見る」lands on the exact saved result.
  // The deep link targets the durable /projects/<id> detail page, which loads
  // the 成果物 from the server store by id — so it resolves on any device / cold
  // start, not only the browser tab that ran the request.
  const resultProjectId = `commander-${input.runId}`;
  const resultDeepLink = `/projects/${encodeURIComponent(resultProjectId)}`;

  if (finalStatus === "completed") {
    // Persist first so the notification can deep-link straight to the saved
    // result (成果物) instead of a generic workspace page.
    if (lastResult) {
      await persistCommanderResultAsProject({
        userId: input.userId,
        assignment: plan.assignment,
        result: lastResult,
        projectId: resultProjectId,
      });
    }
    notifyWorkCompleted(input.userId, {
      title: "AIオーケストレーター完了報告",
      message: snsPublishedTweetUrl
        ? `「${plan.classification.summary}」が完了し、Xへ投稿しました。${snsPublishedTweetUrl}`
        : `「${plan.classification.summary}」が完了しました。`,
      actionUrl: lastResult ? resultDeepLink : "/workspace",
      relatedTaskId: lastResult ? resultProjectId : null,
    });
    try {
      runLearningAnalysis(input.userId, { periodDays: 30 });
    } catch (error) {
      console.warn("[commander] Learning analysis failed:", error);
    }
  } else if (finalStatus === "partial") {
    if (lastResult) {
      await persistCommanderResultAsProject({
        userId: input.userId,
        assignment: plan.assignment,
        result: lastResult,
        projectId: resultProjectId,
      });
    }
    notifyWorkCompleted(input.userId, {
      title: "AIオーケストレーター一部完了",
      message: snsPublishReason
        ? `投稿文は準備できましたが、Xへの投稿に失敗しました: ${snsPublishReason}`
        : "一部の成果は保存できます。内容を確認してください。",
      actionUrl: lastResult ? resultDeepLink : "/workspace",
      relatedTaskId: lastResult ? resultProjectId : null,
    });
  } else if (finalStatus === "cancelled") {
    notifyWorkFailed(input.userId, {
      title: "AIオーケストレーターを中止しました",
      message: "実行はユーザー操作により中止されました。",
    });
  } else {
    // Persist the failed run (with its error) so「確認する」deep-links to a page
    // that explains 生成に失敗しました + reason instead of a dead/blank list.
    const failureReason =
      lastResult?.error ?? attempts.at(-1)?.error ?? "実行に失敗しました。";
    const failedResult: OrchestrationResult = lastResult
      ? { ...lastResult, status: "failed", error: failureReason }
      : {
          assignment: plan.assignment,
          status: "failed",
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
          totalDurationMs: attempts.reduce(
            (sum, item) => sum + item.durationMs,
            0,
          ),
          error: failureReason,
        };
    await persistCommanderResultAsProject({
      userId: input.userId,
      assignment: plan.assignment,
      result: failedResult,
      projectId: resultProjectId,
    });
    notifyWorkFailed(input.userId, {
      title: "AIオーケストレーター失敗報告",
      message: failureReason,
      actionUrl: resultDeepLink,
      relatedTaskId: resultProjectId,
    });
  }

  return toRunResult({
    runId: input.runId,
    status: finalStatus,
    plan,
    result: lastResult,
    attempts,
    confirmationReasons: run.confirmationReasons,
    externalMessages: external.messages,
    workMemory,
    workMemoryCandidates,
  });
}

export function planCommander(input: {
  assignment: string;
  userId: string | null;
}): CommanderRunResult {
  const plan = buildCommanderPlan(input);
  const confirmation = evaluateCommanderConfirmation(input.assignment, plan);
  let runId: string | null = null;

  if (input.userId) {
    const record = createCommanderRun({
      userId: input.userId,
      assignment: input.assignment,
      plan,
      status: "planning",
      confirmationReasons: confirmation.reasons,
    });
    runId = record.id;
  }

  return toRunResult({
    runId,
    status: "planning",
    plan,
    result: null,
    attempts: [],
    confirmationReasons: confirmation.reasons,
    externalMessages: plan.requiredExternalServices.map(
      (service) => `${service.label}: ${service.connectionStatus}`,
    ),
  });
}

export async function executeCommander(input: {
  assignment: string;
  userId: string | null;
  metadata?: Readonly<Record<string, unknown>>;
  confirmed?: boolean;
  runId?: string;
}): Promise<CommanderRunResult> {
  if (!input.userId) {
    throw new Error("Unauthorized");
  }

  // Resume existing awaiting run after confirmation
  if (input.runId && input.confirmed) {
    const existing = getCommanderRun(input.runId, input.userId);
    if (!existing) throw new Error("Commander run not found");
    if (existing.status === "cancelled") {
      return toRunResult({
        runId: existing.id,
        status: "cancelled",
        plan: existing.plan,
        result: existing.result,
        attempts: existing.attempts,
        confirmationReasons: existing.confirmationReasons,
        externalMessages: [],
      });
    }
    return executeStoredRun({
      runId: input.runId,
      userId: input.userId,
      metadata: input.metadata,
    });
  }

  const plan = buildCommanderPlan({
    assignment: input.assignment,
    userId: input.userId,
  });
  const confirmation = evaluateCommanderConfirmation(input.assignment, plan);
  const external = await runExternalPreflightParallel(plan);

  const record = createCommanderRun({
    userId: input.userId,
    assignment: input.assignment,
    plan,
    status: confirmation.required ? "awaiting_confirmation" : "planning",
    confirmationReasons: confirmation.reasons,
  });

  if (confirmation.required && !input.confirmed) {
    updateCommanderRun(record.id, input.userId, {
      status: "awaiting_confirmation",
    });
    notifyAutomationAwaitingReview(input.userId, {
      automationId: record.id,
      name: confirmation.reasons[0] ?? "実行前確認が必要な依頼",
    });
    return toRunResult({
      runId: record.id,
      status: "awaiting_confirmation",
      plan,
      result: null,
      attempts: [],
      confirmationReasons: confirmation.reasons,
      externalMessages: external.messages,
    });
  }

  return executeStoredRun({
    runId: record.id,
    userId: input.userId,
    metadata: input.metadata,
  });
}

export async function confirmCommanderRun(input: {
  runId: string;
  userId: string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<CommanderRunResult> {
  return executeCommander({
    assignment: "",
    userId: input.userId,
    runId: input.runId,
    confirmed: true,
    metadata: input.metadata,
  });
}

export function cancelCommanderRun(input: {
  runId: string;
  userId: string;
}): CommanderRunResult {
  const cancelled = requestCommanderCancel(input.runId, input.userId);
  if (!cancelled) {
    throw new Error("Commander run not found");
  }
  return toRunResult({
    runId: cancelled.id,
    status: cancelled.status,
    plan: cancelled.plan,
    result: cancelled.result,
    attempts: cancelled.attempts,
    confirmationReasons: cancelled.confirmationReasons,
    externalMessages: [],
  });
}
