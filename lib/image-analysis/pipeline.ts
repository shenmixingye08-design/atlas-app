import "server-only";

import {
  hasFailedImageAttachments,
  readAvailableImageAttachments,
  readAttachmentsFromMetadata,
  isImageAttachment,
} from "@/lib/attachments/metadata";
import {
  emptyDeliverable,
  type Deliverable,
} from "@/lib/orchestration/deliverable-types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import type { OrchestrationResult } from "@/lib/orchestration/types";

import { analyzeAttachedImages } from "./analyze";
import {
  detectImageDocumentIntent,
  isStructuredImageDocumentIntent,
} from "./intent";
import { mergeImageAnalyses } from "./merge";
import { imageAnalysisToMarkdown } from "./to-markdown";
import type { ImageAnalysisResult, ImageAnalysisStatus } from "./types";
import {
  IMAGE_ANALYSIS_FAILED_USER_MESSAGE,
  IMAGE_ANALYSIS_STATUS_LABELS,
  IMAGE_FETCH_FAILED_USER_MESSAGE,
} from "./types";

export function preferredFormatsForAnalysis(
  analysis: ImageAnalysisResult,
): Array<"xlsx" | "csv" | "pdf" | "docx" | "md"> {
  switch (analysis.documentType) {
    case "business_card":
      return ["csv", "xlsx", "pdf", "docx", "md"];
    case "handwritten": {
      const hasTodos = analysis.rows.length > 0;
      return hasTodos
        ? ["docx", "pdf", "md", "xlsx", "csv"]
        : ["docx", "pdf", "md"];
    }
    case "receipt":
    case "invoice":
    case "estimate":
    case "table":
      return ["xlsx", "csv", "pdf", "docx", "md"];
    default:
      return ["md", "pdf", "docx"];
  }
}

export function buildDeliverableFromAnalysis(
  analysis: ImageAnalysisResult,
): Deliverable {
  const markdown = imageAnalysisToMarkdown(analysis);
  const formats = preferredFormatsForAnalysis(analysis);
  const base = emptyDeliverable("document");

  return {
    ...base,
    type: "document",
    title: analysis.title,
    summary: analysis.warnings[0] ?? `${analysis.title}の解析結果`,
    content: markdown,
    markdown,
    html: markdown
      .split("\n")
      .map((line) => `<p>${line}</p>`)
      .join(""),
    plainText: markdown,
    metadata: {
      ...base.metadata,
      tags: [analysis.documentType, "image-analysis"],
      topic: analysis.documentType,
      audience: "user",
      seo: {
        title: analysis.title,
        description: analysis.warnings[0] ?? analysis.title,
        keywords: [analysis.documentType],
      },
    },
    downloads: formats.map((format) => ({
      format,
      label: format.toUpperCase(),
      ready: true,
    })),
  };
}

function buildFailedResult(input: {
  assignment: string;
  message: string;
  status: Extract<ImageAnalysisStatus, "image_fetch_failed" | "analysis_failed">;
  metadata?: Readonly<Record<string, unknown>>;
}): OrchestrationResult {
  return {
    assignment: input.assignment,
    status: "failed",
    workflow: hydrateWorkflowState({ status: "failed", approved: false }),
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: emptyDeliverable("document"),
    reviewComments: "",
    approved: false,
    finalResponse: input.message,
    totalDurationMs: 0,
    error: input.message,
    warnings: [IMAGE_ANALYSIS_STATUS_LABELS[input.status]],
  };
}

export type ImageDocumentPipelineResult =
  | {
      handled: true;
      result: OrchestrationResult;
      analysis?: ImageAnalysisResult;
      status: ImageAnalysisStatus;
    }
  | { handled: false };

/**
 * Structured image-document path (receipt / invoice / table / card / memo).
 * Bypasses Planner invention when the request is clearly image→data.
 */
export async function maybeRunImageDocumentPipeline(input: {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<ImageDocumentPipelineResult> {
  const attachments = readAttachmentsFromMetadata(input.metadata);
  const imageAttachments = attachments.filter(isImageAttachment);
  if (imageAttachments.length === 0) {
    return { handled: false };
  }

  const intent = detectImageDocumentIntent(input.assignment);
  if (!isStructuredImageDocumentIntent(intent)) {
    // Still hard-fail when user attached images that all failed to upload.
    if (
      hasFailedImageAttachments(input.metadata) &&
      readAvailableImageAttachments(input.metadata).length === 0
    ) {
      return {
        handled: true,
        status: "image_fetch_failed",
        result: buildFailedResult({
          assignment: input.assignment,
          message: IMAGE_FETCH_FAILED_USER_MESSAGE,
          status: "image_fetch_failed",
          metadata: input.metadata,
        }),
      };
    }
    return { handled: false };
  }

  if (
    hasFailedImageAttachments(input.metadata) &&
    readAvailableImageAttachments(input.metadata).length === 0
  ) {
    return {
      handled: true,
      status: "image_fetch_failed",
      result: buildFailedResult({
        assignment: input.assignment,
        message: IMAGE_FETCH_FAILED_USER_MESSAGE,
        status: "image_fetch_failed",
      }),
    };
  }

  const available = readAvailableImageAttachments(input.metadata);
  if (available.length === 0) {
    return {
      handled: true,
      status: "image_fetch_failed",
      result: buildFailedResult({
        assignment: input.assignment,
        message: IMAGE_FETCH_FAILED_USER_MESSAGE,
        status: "image_fetch_failed",
      }),
    };
  }

  // Analyze all available images (same type merge). Cap already applied in metadata.
  const perImage: ImageAnalysisResult[] = [];
  for (const item of available) {
    const singleMeta = {
      ...(input.metadata ?? {}),
      attachments: [
        {
          ...item,
        },
      ],
    };
    const analyzed = await analyzeAttachedImages({
      assignment: input.assignment,
      documentType: intent.documentType,
      metadata: singleMeta,
    });
    if (!analyzed.ok) {
      // Keep going for multi-image; record warning via empty skip
      continue;
    }
    perImage.push(analyzed.analysis);
  }

  if (perImage.length === 0) {
    return {
      handled: true,
      status: "analysis_failed",
      result: buildFailedResult({
        assignment: input.assignment,
        message: IMAGE_ANALYSIS_FAILED_USER_MESSAGE,
        status: "analysis_failed",
      }),
    };
  }

  const merged = mergeImageAnalyses(perImage);
  if (!merged) {
    return {
      handled: true,
      status: "analysis_failed",
      result: buildFailedResult({
        assignment: input.assignment,
        message: IMAGE_ANALYSIS_FAILED_USER_MESSAGE,
        status: "analysis_failed",
      }),
    };
  }

  const deliverable = buildDeliverableFromAnalysis(merged);
  const statusLabel = IMAGE_ANALYSIS_STATUS_LABELS.completed;
  const finalResponse = merged.requiresReview
    ? `${merged.title}の解析が完了しました（要確認項目あり）。${statusLabel}`
    : `${merged.title}の解析が完了しました。${statusLabel}`;

  const result: OrchestrationResult = {
    assignment: input.assignment,
    status: "completed",
    workflow: hydrateWorkflowState({
      status: "completed",
      approved: !merged.requiresReview,
    }),
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable,
    reviewComments: merged.warnings.join("\n"),
    approved: !merged.requiresReview,
    finalResponse,
    totalDurationMs: 0,
    warnings: [
      ...merged.warnings,
      IMAGE_ANALYSIS_STATUS_LABELS.analyzing_images,
      IMAGE_ANALYSIS_STATUS_LABELS.validating_data,
      IMAGE_ANALYSIS_STATUS_LABELS.creating_deliverable,
      statusLabel,
    ],
    imageAnalysis: merged,
    imageAnalysisStatus: "completed",
  };

  return {
    handled: true,
    status: "completed",
    analysis: merged,
    result,
  };
}

export function readImageAnalysisFromResult(
  result: OrchestrationResult | null | undefined,
): ImageAnalysisResult | null {
  if (!result?.imageAnalysis) return null;
  return result.imageAnalysis;
}
