import "server-only";

import { orchestrate } from "@/lib/orchestration/orchestrator";
import { sanitizeOrchestrationResultForClient } from "@/lib/orchestration/sanitize-response";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import { buildCompanyOrchestrationMetadata } from "@/lib/company-templates/loader";
import { resolveCompanyTemplateIdFromMetadata } from "@/lib/company-templates/context";
import { getServerActiveCompanyState } from "@/lib/company-templates/store";
import {
  notifyWorkCompleted,
  notifyWorkFailed,
  notifyWorkNeedsReview,
} from "@/lib/notifications/emitters";
import { persistCommanderResultAsProject } from "@/lib/commander/durable-store";
import { buildAtlasMemoryMetadata } from "@/lib/user-memory/metadata";
import {
  getMemoriesForAssignment,
  learnFromOrchestration,
} from "@/lib/user-memory/service";
import {
  buildWorkMemoryMetadata,
  shouldSkipWorkMemory,
  summarizeWorkMemoriesForClient,
} from "@/lib/work-memory/metadata";
import {
  getWorkMemoriesForAssignment,
  isWorkMemoryEnabled,
  learnFromOrchestrationWorkMemory,
  markWorkMemoriesUsed,
} from "@/lib/work-memory/service";
import type { WorkMemoryType } from "@/lib/work-memory/types";
import {
  hydrateHierarchicalMemory,
  learnFromApprovedDeliverable,
  prepareMemoryForGeneration,
} from "@/lib/hierarchical-memory";
import { ensureWorkMemoryHydrated } from "@/lib/work-memory/durable";
import { recordLearningEventFromOrchestration } from "@/lib/learning-engine/service";
import { recordPopularityFromOrchestration } from "@/lib/owner/popularity-ranking/telemetry";
import { recordAnonymousUserActivity } from "@/lib/owner/anonymous-user-analysis/telemetry";
import { recordEmployeeTeamTelemetry } from "@/lib/team-collaboration/telemetry";

/**
 * Task-type-specific completed titles so the notification is understandable
 * without opening it (ATLAS: reduce clicks / show intent up front). No internal
 * terms — user-facing wording only.
 */
const COMPLETED_TITLE_BY_TYPE: Record<string, string> = {
  blog: "ブログ記事を作成しました",
  report: "レポートを作成しました",
  proposal: "提案書を作成しました",
  presentation: "資料を作成しました",
  research: "調査レポートを作成しました",
  email: "メールの準備が完了しました",
  social_post: "SNS投稿を作成しました",
  short_document: "資料を作成しました",
  document: "資料を作成しました",
};

function completedTitleForDeliverable(
  type: string | null | undefined,
): string {
  return (type && COMPLETED_TITLE_BY_TYPE[type]) || "ご依頼の仕事が完了しました";
}

export type RunOrchestrationForUserInput = {
  assignment: string;
  userId: string | null;
  metadata?: Readonly<Record<string, unknown>>;
  /** When false, caller owns notifications (e.g. Commander report). Default true. */
  notify?: boolean;
  /** When false, skip learning / work-memory candidate writes. Default true. */
  recordLearning?: boolean;
};

export type RunOrchestrationForUserResult = {
  result: OrchestrationResult;
  workMemory?: OrchestrationResult["workMemory"];
  workMemoryCandidates?: unknown[];
  usedWorkMemoryCount: number;
  memoryTypesUsed: WorkMemoryType[];
};

/**
 * Shared orchestration entry used by `/api/orchestrate` and Commander.
 * Does not invent a second pipeline — wraps existing `orchestrate()` + memory hooks.
 */
export async function runOrchestrationForUser(
  input: RunOrchestrationForUserInput,
): Promise<RunOrchestrationForUserResult> {
  const notify = input.notify !== false;
  const recordLearning = input.recordLearning !== false;

  const templateId =
    resolveCompanyTemplateIdFromMetadata(input.metadata) ??
    getServerActiveCompanyState().templateId;

  if (input.userId) {
    await ensureWorkMemoryHydrated(input.userId);
    await hydrateHierarchicalMemory(input.userId);
  }

  const skipWorkMemory = shouldSkipWorkMemory(input.metadata);
  const workMemoryEnabled =
    input.userId != null && isWorkMemoryEnabled(input.userId);
  const usedWorkMemories =
    input.userId != null && workMemoryEnabled && !skipWorkMemory
      ? getWorkMemoriesForAssignment(input.userId, input.assignment)
      : [];

  if (input.userId && usedWorkMemories.length > 0) {
    markWorkMemoriesUsed(
      input.userId,
      usedWorkMemories.map((memory) => memory.id),
    );
  }

  const memoryMeta =
    input.userId != null
      ? buildAtlasMemoryMetadata(
          getMemoriesForAssignment(input.userId, input.assignment),
        )
      : null;

  const workMemoryMeta =
    usedWorkMemories.length > 0
      ? buildWorkMemoryMetadata(usedWorkMemories)
      : null;

  const hierarchicalPrep =
    input.userId != null
      ? prepareMemoryForGeneration({
          userId: input.userId,
          assignment: input.assignment,
          projectId:
            typeof input.metadata?.projectId === "string"
              ? input.metadata.projectId
              : null,
          jobId:
            typeof input.metadata?.jobId === "string" ? input.metadata.jobId : null,
          automationId:
            typeof input.metadata?.automationId === "string"
              ? input.metadata.automationId
              : null,
        })
      : null;

  // Critical missing info → do not fake a completed deliverable
  if (hierarchicalPrep && !hierarchicalPrep.missing.canProceed) {
    const waiting: OrchestrationResult = {
      assignment: input.assignment,
      status: "failed",
      ceo: null,
      plannerPlan: null,
      plannerTasks: null,
      tasks: [],
      executions: [],
      deliverable: emptyDeliverable("document"),
      reviewComments: "",
      approved: false,
      finalResponse: hierarchicalPrep.missing.reason,
      totalDurationMs: 0,
      error: hierarchicalPrep.missing.questions.map((q) => q.question).join(" / "),
      warnings: hierarchicalPrep.missing.assumptions,
      deliveryStatus: "waiting_for_user",
      missingInfo: hierarchicalPrep.missing,
      hierarchicalMemory: {
        usedIds: hierarchicalPrep.bundle.usedIds,
        savedIds: hierarchicalPrep.savedFromAssignment.map((m) => m.id),
        assumptions: hierarchicalPrep.missing.assumptions,
        promptPreview: hierarchicalPrep.bundle.promptBlock.slice(0, 400),
      },
      qualityAssurance: {
        generationCount: 0,
        evaluationCount: 0,
        revisionCount: 0,
        overallScore: null,
        majorErrors: [],
        usedMemoryIds: hierarchicalPrep.bundle.usedIds,
        savedMemoryIds: hierarchicalPrep.savedFromAssignment.map((m) => m.id),
      },
      workflow: hydrateWorkflowState({ status: "failed", approved: false }),
    };

    if (notify) {
      notifyWorkFailed(input.userId, {
        title: "追加情報が必要です",
        message: hierarchicalPrep.missing.questions.map((q) => q.question).join(" "),
      });
    }

    return {
      result: waiting,
      usedWorkMemoryCount: usedWorkMemories.length,
      memoryTypesUsed: usedWorkMemories.map((memory) => memory.type),
    };
  }

  const result = sanitizeOrchestrationResultForClient(
    await orchestrate({
      assignment: input.assignment,
      metadata: {
        ...buildCompanyOrchestrationMetadata(templateId),
        ...(input.metadata ?? {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(memoryMeta ?? {}),
        ...(workMemoryMeta ?? {}),
        ...(hierarchicalPrep?.metadata ?? {}),
      },
    }),
  );

  if (hierarchicalPrep) {
    result.hierarchicalMemory = {
      usedIds: hierarchicalPrep.bundle.usedIds,
      savedIds: hierarchicalPrep.savedFromAssignment.map((m) => m.id),
      assumptions: hierarchicalPrep.missing.assumptions,
      promptPreview: hierarchicalPrep.bundle.promptBlock.slice(0, 400),
    };
    result.deliveryStatus =
      result.qualityLoop?.deliveryStatus ??
      (result.status === "failed"
        ? "failed"
        : result.approved
          ? "completed"
          : "needs_review");
    result.qualityAssurance = {
      generationCount: 1,
      evaluationCount: result.qualityLoop?.reviews.length ?? 0,
      revisionCount: result.qualityLoop?.revisionCount ?? 0,
      overallScore: result.qualityLoop?.enhancedScore ?? result.qualityLoop?.currentScore ?? null,
      majorErrors: (result.qualityLoop?.majorErrors ?? []) as import("@/lib/deliverable-quality").MajorErrorCode[],
      usedMemoryIds: hierarchicalPrep.bundle.usedIds,
      savedMemoryIds: hierarchicalPrep.savedFromAssignment.map((m) => m.id),
      durationMs: result.totalDurationMs,
    };
  }

  const workMemory =
    usedWorkMemories.length > 0
      ? {
          message: "過去の仕事の進め方を反映しています。",
          used: summarizeWorkMemoriesForClient(usedWorkMemories),
        }
      : undefined;

  const memoryTypesUsed = usedWorkMemories.map((memory) => memory.type);

  // Stable id shared by the durable persist and the notification deep link so
  //「結果を見る」/「確認する」opens the exact 成果物 from the server on any device.
  // Only used when this call owns notifications (Commander sets notify:false and
  // manages its own persist + deep link under a commander-<runId> id).
  const deepLinkProjectId =
    notify && input.userId ? `orchestrate-${crypto.randomUUID()}` : null;
  const deepLink = deepLinkProjectId
    ? `/projects/${encodeURIComponent(deepLinkProjectId)}`
    : null;

  const deliveryStatus =
    result.deliveryStatus ?? result.qualityLoop?.deliveryStatus;
  const isSuccessfulDelivery =
    result.status !== "failed" &&
    result.approved &&
    (deliveryStatus === "completed" || deliveryStatus == null);
  const needsReview =
    deliveryStatus === "needs_review" ||
    deliveryStatus === "waiting_for_user" ||
    (!isSuccessfulDelivery && result.status !== "failed");

  if (result.status === "failed" && deliveryStatus !== "needs_review") {
    if (notify && input.userId && deepLinkProjectId) {
      await persistCommanderResultAsProject({
        userId: input.userId,
        assignment: input.assignment,
        result,
        projectId: deepLinkProjectId,
      });
    }
    if (notify) {
      notifyWorkFailed(input.userId, {
        title: "仕事の実行に失敗しました",
        message: result.error ?? "処理中にエラーが発生しました。",
        ...(deepLink && {
          actionUrl: deepLink,
          relatedTaskId: deepLinkProjectId,
          deliverableId: deepLinkProjectId,
          requestId: deepLinkProjectId,
        }),
      });
    }
    return {
      result,
      workMemory,
      usedWorkMemoryCount: usedWorkMemories.length,
      memoryTypesUsed,
    };
  }

  if (notify && input.userId && deepLinkProjectId) {
    await persistCommanderResultAsProject({
      userId: input.userId,
      assignment: input.assignment,
      result,
      projectId: deepLinkProjectId,
    });
  }
  if (notify) {
    if (needsReview) {
      notifyWorkNeedsReview(input.userId, {
        title: "ご確認が必要な成果物があります",
        message:
          result.qualityLoop?.ceoApproval?.comments ||
          result.error ||
          "自動品質チェックで要確認となりました。内容をご確認ください。",
        ...(deepLink && {
          actionUrl: deepLink,
          relatedTaskId: deepLinkProjectId,
          deliverableId: deepLinkProjectId,
          requestId: deepLinkProjectId,
        }),
      });
    } else {
      const completedTitle = completedTitleForDeliverable(result.deliverable?.type);
      notifyWorkCompleted(input.userId, {
        title: completedTitle,
        message: `${completedTitle}。ご確認をお願いいたします。`,
        ...(deepLink && {
          actionUrl: deepLink,
          relatedTaskId: deepLinkProjectId,
          deliverableId: deepLinkProjectId,
          requestId: deepLinkProjectId,
        }),
      });
    }
  }

  recordPopularityFromOrchestration({
    assignment: input.assignment,
    metadata: input.metadata,
    deliverableType: result.deliverable?.type,
    userId: input.userId,
  });
  recordAnonymousUserActivity({
    userId: input.userId,
    assignment: input.assignment,
    metadata: input.metadata,
    deliverableType: result.deliverable?.type,
    costUsd: result.costDebug?.estimatedCostUsd ?? 0.01,
    source: "orchestration",
  });

  let workMemoryCandidates: unknown[] | undefined;

  if (input.userId && recordLearning) {
    learnFromOrchestration({
      userId: input.userId,
      assignment: input.assignment,
      deliverableType: result.deliverable?.type,
      metadata: input.metadata,
    });

    workMemoryCandidates = learnFromOrchestrationWorkMemory({
      userId: input.userId,
      assignment: input.assignment,
      deliverableType: result.deliverable?.type,
      finalResponse: result.finalResponse,
      metadata: input.metadata,
    });

    if (result.approved && result.deliverable && deliveryStatus === "completed") {
      const approvedLearned = learnFromApprovedDeliverable({
        userId: input.userId,
        assignment: input.assignment,
        deliverable: result.deliverable,
        projectId:
          typeof input.metadata?.projectId === "string"
            ? input.metadata.projectId
            : null,
        jobId:
          typeof input.metadata?.jobId === "string" ? input.metadata.jobId : null,
        automationId:
          typeof input.metadata?.automationId === "string"
            ? input.metadata.automationId
            : null,
      });
      if (result.hierarchicalMemory && approvedLearned.length > 0) {
        result.hierarchicalMemory = {
          ...result.hierarchicalMemory,
          savedIds: [
            ...result.hierarchicalMemory.savedIds,
            ...approvedLearned.map((memory) => memory.id),
          ],
        };
      }
    }

    recordLearningEventFromOrchestration({
      userId: input.userId,
      assignment: input.assignment,
      deliverableType: result.deliverable?.type,
      durationMs: result.totalDurationMs,
      memoriesUsedCount: usedWorkMemories.length,
      memoryTypesUsed,
      correctionApplied:
        typeof input.metadata?.correctionBefore === "string" &&
        typeof input.metadata?.correctionAfter === "string",
      completed: result.approved && deliveryStatus === "completed",
    });

    recordEmployeeTeamTelemetry(result);
  }

  return {
    result,
    workMemory,
    ...(workMemoryCandidates &&
      workMemoryCandidates.length > 0 && { workMemoryCandidates }),
    usedWorkMemoryCount: usedWorkMemories.length,
    memoryTypesUsed,
  };
}
