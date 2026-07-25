import "server-only";

import { prepareAssignmentWithVision } from "@/lib/vision/prepare-assignment";
import { stripVisionPoisonText } from "@/lib/vision/gate";
import { ensureWorkMemoryHydrated } from "@/lib/work-memory/durable";

import {
  cancelCommanderRun,
  confirmCommanderRun,
  executeCommander,
  planCommander,
} from "./execute";
import { buildCommanderPlan } from "./plan";
import {
  ensureCommanderRunsHydrated,
  getCommanderRun,
  listCommanderRunsForUser,
} from "./run-store";
import type {
  CommanderRequest,
  CommanderRunResult,
  CommanderVisionGate,
} from "./types";

function blockedVisionResult(input: {
  assignment: string;
  userId: string;
  gate: CommanderVisionGate;
}): CommanderRunResult {
  const plan = buildCommanderPlan({
    assignment: stripVisionPoisonText(input.assignment),
    userId: input.userId,
  });
  const title =
    input.gate.status === "needs_input"
      ? "画像の確認が必要です"
      : "画像の内容を解析できませんでした";
  return {
    runId: null,
    status: "failed",
    plan,
    result: null,
    attempts: [],
    confirmationReasons: [],
    visionGate: input.gate,
    report: {
      status: "failed",
      title,
      summary: input.gate.message,
      classification: plan.classification.summary,
      aisUsed: [],
      externalServices: [],
      templateLabel: plan.requiredTemplate.label,
      memoryUsedCount: 0,
      attempts: 0,
      retriesUsed: 0,
      projectHint: "",
      automationHint: null,
      confirmationReasons: [],
    },
  };
}

async function maybeEnrichWithVision(input: {
  userId: string;
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<{
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
  gate?: CommanderVisionGate;
}> {
  const attachmentIds = input.metadata?.attachmentIds;
  const hasAttachments =
    Array.isArray(attachmentIds) &&
    attachmentIds.some((id) => typeof id === "string" && id.trim().length > 0);

  if (!hasAttachments) {
    return {
      assignment: stripVisionPoisonText(input.assignment),
      metadata: input.metadata,
    };
  }

  const prepared = await prepareAssignmentWithVision({
    userId: input.userId,
    assignment: input.assignment,
    metadata: input.metadata,
  });

  if (prepared.gate) {
    return {
      assignment: prepared.assignment,
      metadata: prepared.metadata,
      gate: prepared.gate,
    };
  }

  // Hard safety: never proceed with poison fallback language when images are attached.
  if (!prepared.metadata.visionAnalysisSuccess) {
    return {
      assignment: prepared.assignment,
      metadata: prepared.metadata,
      gate: {
        status: "vision_failed",
        analysisSuccess: false,
        message: "画像の内容を解析できませんでした",
        userCode: "image_analyze_failed",
      },
    };
  }

  return {
    assignment: prepared.assignment,
    metadata: prepared.metadata,
  };
}

export function parseCommanderRequest(body: unknown):
  | CommanderRequest
  | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const record = body as {
    assignment?: unknown;
    metadata?: unknown;
    mode?: unknown;
    runId?: unknown;
    confirmed?: unknown;
  };

  const mode =
    record.mode === undefined
      ? "execute"
      : record.mode === "plan" ||
          record.mode === "execute" ||
          record.mode === "confirm" ||
          record.mode === "cancel"
        ? record.mode
        : null;

  if (!mode) {
    return { error: "mode must be plan, execute, confirm, or cancel" };
  }

  if (
    record.metadata !== undefined &&
    (typeof record.metadata !== "object" || record.metadata === null)
  ) {
    return { error: "metadata must be an object" };
  }

  if (mode === "confirm" || mode === "cancel") {
    if (typeof record.runId !== "string" || !record.runId.trim()) {
      return { error: "runId is required for confirm/cancel" };
    }
    return {
      assignment: "",
      mode,
      runId: record.runId.trim(),
      confirmed: mode === "confirm",
      ...(record.metadata !== undefined && {
        metadata: record.metadata as Readonly<Record<string, unknown>>,
      }),
    };
  }

  if (typeof record.assignment !== "string" || !record.assignment.trim()) {
    return { error: "assignment is required and must be a non-empty string" };
  }

  return {
    assignment: record.assignment.trim(),
    mode,
    ...(typeof record.runId === "string" &&
      record.runId.trim() && { runId: record.runId.trim() }),
    ...(record.confirmed === true && { confirmed: true }),
    ...(record.metadata !== undefined && {
      metadata: record.metadata as Readonly<Record<string, unknown>>,
    }),
  };
}

export async function runCommanderRequest(input: {
  request: CommanderRequest;
  userId: string | null;
}): Promise<CommanderRunResult> {
  if (!input.userId) {
    throw new Error("Unauthorized");
  }

  await ensureCommanderRunsHydrated(input.userId);
  await ensureWorkMemoryHydrated(input.userId);

  if (input.request.mode === "plan") {
    const enriched = await maybeEnrichWithVision({
      userId: input.userId,
      assignment: input.request.assignment,
      metadata: input.request.metadata,
    });
    if (enriched.gate) {
      return blockedVisionResult({
        assignment: enriched.assignment,
        userId: input.userId,
        gate: enriched.gate,
      });
    }
    return planCommander({
      assignment: enriched.assignment,
      userId: input.userId,
    });
  }

  if (input.request.mode === "cancel") {
    return cancelCommanderRun({
      runId: input.request.runId!,
      userId: input.userId,
    });
  }

  if (input.request.mode === "confirm") {
    return confirmCommanderRun({
      runId: input.request.runId!,
      userId: input.userId,
      metadata: input.request.metadata,
    });
  }

  const enriched = await maybeEnrichWithVision({
    userId: input.userId,
    assignment: input.request.assignment,
    metadata: input.request.metadata,
  });

  if (enriched.gate) {
    // CRITICAL: do not run Artifact Engine / orchestration without successful vision.
    return blockedVisionResult({
      assignment: enriched.assignment,
      userId: input.userId,
      gate: enriched.gate,
    });
  }

  return executeCommander({
    assignment: enriched.assignment,
    userId: input.userId,
    metadata: enriched.metadata,
    confirmed: input.request.confirmed,
    runId: input.request.runId,
  });
}

export {
  buildCommanderPlan,
  cancelCommanderRun,
  confirmCommanderRun,
  executeCommander,
  getCommanderRun,
  listCommanderRunsForUser,
  planCommander,
};
