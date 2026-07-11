import "server-only";

import { orchestrate } from "@/lib/orchestration/orchestrator";
import { sanitizeOrchestrationResultForClient } from "@/lib/orchestration/sanitize-response";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { buildCompanyOrchestrationMetadata } from "@/lib/company-templates/loader";
import { resolveCompanyTemplateIdFromMetadata } from "@/lib/company-templates/context";
import { getServerActiveCompanyState } from "@/lib/company-templates/store";
import { notifyWorkCompleted, notifyWorkFailed } from "@/lib/notifications/emitters";
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
import { recordLearningEventFromOrchestration } from "@/lib/learning-engine/service";
import { recordPopularityFromOrchestration } from "@/lib/owner/popularity-ranking/telemetry";
import { recordAnonymousUserActivity } from "@/lib/owner/anonymous-user-analysis/telemetry";
import { recordEmployeeTeamTelemetry } from "@/lib/team-collaboration/telemetry";

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

  const result = sanitizeOrchestrationResultForClient(
    await orchestrate({
      assignment: input.assignment,
      metadata: {
        ...buildCompanyOrchestrationMetadata(templateId),
        ...(input.metadata ?? {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(memoryMeta ?? {}),
        ...(workMemoryMeta ?? {}),
      },
    }),
  );

  const workMemory =
    usedWorkMemories.length > 0
      ? {
          message: "過去の仕事の進め方を反映しています。",
          used: summarizeWorkMemoriesForClient(usedWorkMemories),
        }
      : undefined;

  const memoryTypesUsed = usedWorkMemories.map((memory) => memory.type);

  if (result.status === "failed") {
    if (notify) {
      notifyWorkFailed(input.userId, {
        title: "仕事の実行に失敗しました",
        message: result.error ?? "処理中にエラーが発生しました。",
      });
    }
    return {
      result,
      workMemory,
      usedWorkMemoryCount: usedWorkMemories.length,
      memoryTypesUsed,
    };
  }

  if (notify) {
    notifyWorkCompleted(input.userId, {
      title: "仕事が完了しました",
      message: "ATLASが依頼した仕事を完了しました。",
    });
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
      completed: true,
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
