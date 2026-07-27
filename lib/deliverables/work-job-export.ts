import "server-only";

import { getDeliverableExportText } from "@/lib/orchestration/final-deliverable";
import { assertSafeExportText } from "@/lib/orchestration/normalize-deliverable-payload";
import type { OrchestrationResult } from "@/lib/orchestration/types";

import { isListedWordDeliverableComplete } from "./completion";
import { generateDeliverables } from "./engine";
import {
  classifyDeliverableFailureReason,
  DELIVERABLE_USER_MESSAGES,
} from "./failure-messages";
import { resolveGenerationFormats } from "./resolve-formats";
import type { Deliverable, DeliverableFormat } from "./types";
import { isExplicitWordRequest } from "./word-intent";
import {
  logWorkPipeline,
  logWorkPipelineFailure,
} from "./work-pipeline-log";

export type WorkJobFileExportResult = {
  deliverables: Deliverable[];
  failures: Array<{ format: string; reasons: string[]; stage?: string }>;
  matchedRule: string | null;
  wordRequired: boolean;
  wordCompleted: boolean;
  status: "completed" | "failed" | "skipped";
  userError: string | null;
};

function preferredFormatsFromMetadata(
  metadata: Readonly<Record<string, unknown>>,
): DeliverableFormat[] | undefined {
  const preferred = metadata.preferredDeliverableFormat;
  if (
    preferred === "xlsx" ||
    preferred === "docx" ||
    preferred === "pdf" ||
    preferred === "txt" ||
    preferred === "md" ||
    preferred === "pptx"
  ) {
    return [preferred];
  }
  return undefined;
}

/**
 * After AI content is ready, generate downloadable files on the server.
 * Word-explicit jobs are not marked complete until a valid docx is stored.
 */
export async function generateDeliverablesForWorkJob(input: {
  jobId: string;
  userId: string;
  assignment: string;
  result: OrchestrationResult;
  metadata: Readonly<Record<string, unknown>>;
  requestOrigin?: string;
}): Promise<WorkJobFileExportResult> {
  const startedAt = Date.now();
  const workflowId =
    typeof input.result.knowledge?.workflowId === "string"
      ? input.result.knowledge.workflowId
      : null;

  const rawExport = getDeliverableExportText(input.result.deliverable).trim();
  if (!rawExport) {
    logWorkPipelineFailure(
      "AI_CONTENT_COMPLETED",
      new Error("empty_ai_content"),
      {
        jobId: input.jobId,
        userId: input.userId,
        workflowId,
        durationMs: Date.now() - startedAt,
      },
    );
    return {
      deliverables: [],
      failures: [
        {
          format: "*",
          reasons: ["empty_deliverable"],
          stage: "ai_content_empty",
        },
      ],
      matchedRule: null,
      wordRequired:
        isExplicitWordRequest(input.assignment) ||
        preferredFormatsFromMetadata(input.metadata)?.includes("docx") === true,
      wordCompleted: false,
      status: "failed",
      userError: DELIVERABLE_USER_MESSAGES.ai_content_empty,
    };
  }

  const guarded = assertSafeExportText(rawExport);
  if (!guarded.ok) {
    return {
      deliverables: [],
      failures: [
        {
          format: "*",
          reasons: [guarded.rejectedReason],
          stage: "ai_content_structure",
        },
      ],
      matchedRule: null,
      wordRequired: isExplicitWordRequest(input.assignment),
      wordCompleted: false,
      status: "failed",
      userError: DELIVERABLE_USER_MESSAGES.ai_content_structure,
    };
  }

  const override = preferredFormatsFromMetadata(input.metadata);
  const detection = resolveGenerationFormats(
    input.assignment,
    override,
    guarded.text,
  );

  logWorkPipeline(
    "FORMAT_DETECTED",
    {
      jobId: input.jobId,
      userId: input.userId,
      workflowId,
      format: detection.formats.join(","),
    },
    { matchedRule: detection.matchedRule },
  );

  const title =
    input.result.deliverable &&
    typeof input.result.deliverable === "object" &&
    "title" in input.result.deliverable
      ? String(
          (input.result.deliverable as { title?: unknown }).title ?? "",
        ).trim() || undefined
      : undefined;

  const generated = await generateDeliverables(
    {
      assignment: input.assignment,
      finalDeliverable: guarded.text,
      title,
      formats: detection.formats,
    },
    input.requestOrigin ?? "http://localhost",
    {
      userId: input.userId,
      jobId: input.jobId,
      workflowId,
      generationAttempt: 1,
    },
  );

  const wordRequired =
    isExplicitWordRequest(input.assignment) ||
    override?.includes("docx") === true ||
    detection.matchedRule === "word_explicit";

  const docxMeta = generated.deliverables.find((d) => d.format === "docx");
  const wordCompleted = Boolean(
    docxMeta &&
      isListedWordDeliverableComplete(docxMeta, input.userId, input.userId),
  );

  const wordFailure = generated.failures.find((f) => f.format === "docx");
  let userError: string | null = null;
  let status: WorkJobFileExportResult["status"] = "completed";

  if (wordRequired) {
    if (!wordCompleted) {
      status = "failed";
      if (wordFailure) {
        userError = classifyDeliverableFailureReason(
          wordFailure.reasons[0] ?? "Word生成失敗",
        ).userMessage;
      } else if (!detection.formats.includes("docx")) {
        userError = DELIVERABLE_USER_MESSAGES.format_detect;
      } else {
        userError = DELIVERABLE_USER_MESSAGES.word_generate;
      }
    }
  } else if (generated.deliverables.length === 0 && generated.failures.length > 0) {
    status = "failed";
    userError = classifyDeliverableFailureReason(
      generated.failures[0]?.reasons[0] ?? "生成失敗",
    ).userMessage;
  }

  const failures = generated.failures.map((f) => ({
    ...f,
    stage: classifyDeliverableFailureReason(f.reasons[0] ?? "").stage,
  }));

  return {
    deliverables: generated.deliverables,
    failures,
    matchedRule: generated.detection.matchedRule,
    wordRequired,
    wordCompleted,
    status,
    userError,
  };
}
