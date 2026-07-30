import "server-only";

import { prepareAssignmentWithVision } from "@/lib/vision/prepare-assignment";
import {
  evaluateMissingAttachmentIdsGate,
  stripVisionPoisonText,
} from "@/lib/vision/gate";
import { ensureWorkMemoryHydrated } from "@/lib/work-memory/durable";
import { bindAttachmentsToJob } from "@/lib/attachments/store";
import type { Deliverable } from "@/lib/deliverables/types";
import {
  resolveWorkJobIdFromMetadata,
  withPropagatedJobId,
} from "@/lib/work-jobs/job-id";

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
  CommanderPersistenceReport,
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
      : input.gate.failedStageLabel
        ? `画像処理に失敗しました（${input.gate.failedStageLabel}）`
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

function readAttachmentIds(metadata: Readonly<Record<string, unknown>> | undefined): string[] {
  const raw = metadata?.attachmentIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
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
  const cleanedAssignment = stripVisionPoisonText(input.assignment);
  const attachmentIds = readAttachmentIds(input.metadata);

  const missingGate = evaluateMissingAttachmentIdsGate({
    assignment: cleanedAssignment,
    attachmentIds,
    metadataAttachments: input.metadata?.attachments,
  });
  if (missingGate) {
    return {
      assignment: cleanedAssignment,
      metadata: {
        ...(input.metadata ?? {}),
        visionStatus: "needs_image_retry",
        visionAnalysisSuccess: false,
        visionUserCode: missingGate.userCode,
      },
      gate: {
        status: "needs_image_retry",
        analysisSuccess: false,
        message: `【画像アップロードで失敗】${missingGate.message}`,
        userCode: missingGate.userCode,
        failedStage: "upload",
        failedStageLabel: "画像アップロード",
        developerCode: missingGate.userCode,
      },
    };
  }

  if (attachmentIds.length === 0) {
    return {
      assignment: cleanedAssignment,
      metadata: input.metadata,
    };
  }

  const prepared = await prepareAssignmentWithVision({
    userId: input.userId,
    assignment: cleanedAssignment,
    metadata: {
      ...(input.metadata ?? {}),
      attachmentIds,
    },
  });

  if (prepared.gate) {
    return {
      assignment: prepared.assignment,
      metadata: prepared.metadata,
      gate: {
        ...prepared.gate,
        payloadAttachmentIds: attachmentIds,
      },
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
        message:
          typeof prepared.metadata.visionError === "string"
            ? prepared.metadata.visionError
            : "【AI解析で失敗】画像の内容を解析できませんでした。再試行してください。",
        userCode:
          typeof prepared.metadata.visionUserCode === "string"
            ? prepared.metadata.visionUserCode
            : "image_analyze_failed",
        diagnosticId:
          typeof prepared.metadata.visionDiagnosticId === "string"
            ? prepared.metadata.visionDiagnosticId
            : null,
        failedStage:
          typeof prepared.metadata.visionFailedStage === "string"
            ? prepared.metadata.visionFailedStage
            : "vision_response",
        failedStageLabel:
          typeof prepared.metadata.visionFailedStageLabel === "string"
            ? prepared.metadata.visionFailedStageLabel
            : "AI解析",
        developerCode:
          typeof prepared.metadata.visionDeveloperCode === "string"
            ? prepared.metadata.visionDeveloperCode
            : "image_analyze_failed",
        payloadAttachmentIds: attachmentIds,
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

  const attachmentIds = readAttachmentIds(enriched.metadata);
  let metadata = enriched.metadata;
  if (attachmentIds.length > 0) {
    const jobId =
      resolveWorkJobIdFromMetadata(enriched.metadata) ||
      `job_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const bind = await bindAttachmentsToJob(
      input.userId,
      attachmentIds,
      jobId,
    );
    if (bind.failed.length > 0) {
      return blockedVisionResult({
        assignment: enriched.assignment,
        userId: input.userId,
        gate: {
          status: "needs_image_retry",
          analysisSuccess: false,
          message: "画像の内容を解析できませんでした",
          userCode: "image_fetch_failed",
        },
      });
    }
    metadata = {
      ...withPropagatedJobId(enriched.metadata, jobId),
      attachmentIds,
      attachmentBindStatus: "bound",
      visionPayloadAttachmentIds: attachmentIds,
    };
  }

  return attachVisionGeneratedFiles(
    await executeCommander({
      assignment: enriched.assignment,
      userId: input.userId,
      metadata,
      confirmed: input.request.confirmed,
      runId: input.request.runId,
    }),
    metadata,
  );
}

/** Merge vision→deliverable files onto the commander result (Excel/Word/PDF). */
function attachVisionGeneratedFiles(
  result: CommanderRunResult,
  metadata: Readonly<Record<string, unknown>> | undefined,
): CommanderRunResult {
  const raw = metadata?.visionGeneratedDeliverables;
  if (!Array.isArray(raw) || raw.length === 0 || !result.result) {
    return result;
  }

  const visionFiles = raw.filter((item): item is Deliverable => {
    if (!item || typeof item !== "object") return false;
    const file = item as Partial<Deliverable>;
    return (
      typeof file.id === "string" &&
      typeof file.format === "string" &&
      typeof file.downloadUrl === "string"
    );
  });
  if (visionFiles.length === 0) return result;

  const existing = result.result.fileDeliverables ?? [];
  const byId = new Map(existing.map((f) => [f.id, f]));
  for (const file of visionFiles) {
    byId.set(file.id, file);
  }
  const merged = [...byId.values()];
  const word = merged.find((f) => f.format === "docx");
  const anyDownloadable = merged.some((f) =>
    Boolean(f.downloadUrl?.includes(`/api/deliverables/${f.id}`)),
  );

  const basePersistence: CommanderPersistenceReport = result.persistence ?? {
    projectId: null,
    projectPersisted: false,
    wordRequired: Boolean(word),
    wordDeliverableId: null,
    wordCompletionVerified: false,
    notificationCreated: false,
  };

  const persistence: CommanderPersistenceReport = {
    ...basePersistence,
    wordRequired: basePersistence.wordRequired || Boolean(word),
    wordDeliverableId: basePersistence.wordDeliverableId ?? word?.id ?? null,
    wordCompletionVerified:
      basePersistence.wordCompletionVerified ||
      (Boolean(word) && anyDownloadable),
  };

  return {
    ...result,
    result: {
      ...result.result,
      fileDeliverables: merged,
    },
    persistence,
  };
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
