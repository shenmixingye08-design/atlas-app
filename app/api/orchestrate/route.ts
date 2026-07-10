import OpenAI from "openai";
import { auth } from "@clerk/nextjs/server";

import { orchestrate } from "@/lib/orchestration/orchestrator";
import { sanitizeOrchestrationResultForClient } from "@/lib/orchestration/sanitize-response";
import { formatUserFacingErrorText, toUserFacingError } from "@/lib/orchestration/user-errors";
import { buildCompanyOrchestrationMetadata } from "@/lib/company-templates/loader";
import { resolveCompanyTemplateIdFromMetadata } from "@/lib/company-templates/context";
import { getServerActiveCompanyState } from "@/lib/company-templates/store";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  featureDisabledMessage,
  isOrchestrationFeatureEnabled,
  resolveOrchestrationFeatureFlag,
} from "@/lib/feature-flags/guards";
import { recordOpenAiFailureIfApplicable } from "@/lib/owner/error-monitoring/telemetry";
import { recordPopularityFromOrchestration } from "@/lib/owner/popularity-ranking/telemetry";
import { recordAnonymousUserActivity } from "@/lib/owner/anonymous-user-analysis/telemetry";
import { notifyWorkCompleted, notifyWorkFailed } from "@/lib/notifications/emitters";
import { recordEmployeeTeamTelemetry } from "@/lib/team-collaboration/telemetry";
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
import { recordLearningEventFromOrchestration } from "@/lib/learning-engine/service";

type RequestBody = {
  assignment?: unknown;
  metadata?: unknown;
};

function parseRequestBody(body: RequestBody): {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
} | { error: string } {
  if (typeof body.assignment !== "string" || !body.assignment.trim()) {
    return {
      error: "assignment is required and must be a non-empty string",
    };
  }

  if (
    body.metadata !== undefined &&
    (typeof body.metadata !== "object" || body.metadata === null)
  ) {
    return { error: "metadata must be an object" };
  }

  return {
    assignment: body.assignment.trim(),
    ...(body.metadata !== undefined && {
      metadata: body.metadata as Readonly<Record<string, unknown>>,
    }),
  };
}

function handleError(error: unknown): Response {
  if (
    error instanceof Error &&
    error.message === "OPENAI_API_KEY is not configured"
  ) {
    return Response.json(
      { error: "AI service is not configured" },
      { status: 503 },
    );
  }

  if (error instanceof OpenAI.APIError) {
    recordOpenAiFailureIfApplicable(error, "orchestrate");
    const userError = toUserFacingError(error);
    return Response.json(
      { error: formatUserFacingErrorText(userError) },
      { status: error.status ?? 500 },
    );
  }

  console.error("[Atlas /api/orchestrate]", error);

  recordOpenAiFailureIfApplicable(error, "orchestrate");
  const userError = toUserFacingError(error);
  return Response.json(
    { error: formatUserFacingErrorText(userError) },
    { status: 500 },
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseRequestBody(body);

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const accessContext = await resolveFeatureAccessContext();
  if (!isOrchestrationFeatureEnabled(parsed, accessContext)) {
    const flagId = resolveOrchestrationFeatureFlag(parsed);
    return Response.json(
      { error: featureDisabledMessage(flagId) },
      { status: 403 },
    );
  }

  try {
    const templateId =
      resolveCompanyTemplateIdFromMetadata(parsed.metadata) ??
      getServerActiveCompanyState().templateId;

    const { userId } = await auth();

    const skipWorkMemory = shouldSkipWorkMemory(parsed.metadata);
    const workMemoryEnabled = userId != null && isWorkMemoryEnabled(userId);
    const usedWorkMemories =
      userId != null && workMemoryEnabled && !skipWorkMemory
        ? getWorkMemoriesForAssignment(userId, parsed.assignment)
        : [];

    if (userId && usedWorkMemories.length > 0) {
      markWorkMemoriesUsed(
        userId,
        usedWorkMemories.map((memory) => memory.id),
      );
    }

    const memoryMeta =
      userId != null
        ? buildAtlasMemoryMetadata(
            getMemoriesForAssignment(userId, parsed.assignment),
          )
        : null;

    const workMemoryMeta =
      usedWorkMemories.length > 0
        ? buildWorkMemoryMetadata(usedWorkMemories)
        : null;

    const result = sanitizeOrchestrationResultForClient(
      await orchestrate({
        assignment: parsed.assignment,
        metadata: {
          ...buildCompanyOrchestrationMetadata(templateId),
          ...(parsed.metadata ?? {}),
          ...(memoryMeta ?? {}),
          ...(workMemoryMeta ?? {}),
        },
      }),
    );

    const enrichedResult = {
      ...result,
      ...(usedWorkMemories.length > 0 && {
        workMemory: {
          message: "過去の仕事の進め方を反映しています。",
          used: summarizeWorkMemoriesForClient(usedWorkMemories),
        },
      }),
    };

    if (result.status === "failed") {
      notifyWorkFailed(userId, {
        title: "仕事の実行に失敗しました",
        message: result.error ?? "処理中にエラーが発生しました。",
      });
      return Response.json(enrichedResult);
    }

    notifyWorkCompleted(userId, {
      title: "仕事が完了しました",
      message: "ATLASが依頼した仕事を完了しました。",
    });

    recordPopularityFromOrchestration({
      assignment: parsed.assignment,
      metadata: parsed.metadata,
      deliverableType: result.deliverable?.type,
      userId,
    });
    recordAnonymousUserActivity({
      userId,
      assignment: parsed.assignment,
      metadata: parsed.metadata,
      deliverableType: result.deliverable?.type,
      costUsd: result.costDebug?.estimatedCostUsd ?? 0.01,
      source: "orchestration",
    });

    if (userId) {
      learnFromOrchestration({
        userId,
        assignment: parsed.assignment,
        deliverableType: result.deliverable?.type,
        metadata: parsed.metadata,
      });

      const candidates = learnFromOrchestrationWorkMemory({
        userId,
        assignment: parsed.assignment,
        deliverableType: result.deliverable?.type,
        finalResponse: result.finalResponse,
        metadata: parsed.metadata,
      });

      recordLearningEventFromOrchestration({
        userId,
        assignment: parsed.assignment,
        deliverableType: result.deliverable?.type,
        durationMs: result.totalDurationMs,
        memoriesUsedCount: usedWorkMemories.length,
        memoryTypesUsed: usedWorkMemories.map((m) => m.type),
        correctionApplied:
          typeof parsed.metadata?.correctionBefore === "string" &&
          typeof parsed.metadata?.correctionAfter === "string",
        completed: true,
      });

      recordEmployeeTeamTelemetry(result);

      return Response.json({
        ...enrichedResult,
        ...(candidates.length > 0 && { workMemoryCandidates: candidates }),
      });
    }

    return Response.json(enrichedResult);
  } catch (error) {
    return handleError(error);
  }
}
