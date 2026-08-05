import "server-only";

import {
  getDeliverableExportText,
  resolveFinalOutputPreview,
} from "@/lib/orchestration/final-deliverable";
import { assertSafeExportText } from "@/lib/orchestration/normalize-deliverable-payload";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import {
  notifyWorkCompleted,
  notifyWorkFailed,
} from "@/lib/notifications/emitters";
import { persistNotificationsNow } from "@/lib/notifications/durable";

import {
  createGenerationFailureDiagnostic,
  mapWordExportReasonToStage,
  type GenerationFailureDiagnostic,
} from "@/lib/orchestration/generation-failure";

import { assignmentRequestsWordFile } from "./detect-formats";
import { generateDeliverables } from "./engine";
import { logWordPipeline } from "./pipeline-log";
import {
  classifyDeliverableError,
  wordFailureTitle,
  wordFailureUserMessage,
} from "./recovery-messages";
import type { Deliverable, DeliverableFormat } from "./types";

export { assignmentRequestsWordFile };

export type ServerWordExportResult =
  | {
      attempted: true;
      ok: true;
      docx: Deliverable;
      files: Deliverable[];
      downloadUrl: string;
      jobId: string;
    }
  | {
      attempted: true;
      ok: false;
      reason: string;
      userMessage: string;
      userTitle: string;
      files: Deliverable[];
      jobId: string;
      stack?: string | null;
      failedStage: string;
      generationFailure: GenerationFailureDiagnostic;
    }
  | { attempted: false; ok: true; files: [] };

function resolveExportSourceText(result: OrchestrationResult): {
  text: string;
  source: string;
} {
  try {
    const rawExport = getDeliverableExportText(result.deliverable);
    const fromDeliverable = (
      typeof rawExport === "string" ? rawExport : ""
    ).trim();
    if (fromDeliverable) {
      return { text: fromDeliverable, source: "deliverable_export" };
    }
  } catch (error) {
    // Never let undefined-field crashes abort Word — fall through to preview.
    console.error(
      "[word_pipeline] getDeliverableExportText threw",
      error instanceof Error ? error.message : error,
      error instanceof Error ? error.stack : undefined,
    );
  }

  const preview = resolveFinalOutputPreview(result);
  if (preview.content.trim()) {
    return { text: preview.content.trim(), source: preview.source };
  }

  const finalResponse =
    typeof result.finalResponse === "string" ? result.finalResponse.trim() : "";
  if (finalResponse) {
    return { text: finalResponse, source: "finalResponse" };
  }

  return { text: "", source: "empty" };
}

/**
 * Server-side Word export after orchestration text is ready.
 * Phone/browser must NOT be required to keep a tab open for .docx creation.
 */
export async function exportWordDeliverableOnServer(input: {
  userId: string;
  assignment: string;
  result: OrchestrationResult;
  requestId: string;
  jobId?: string | null;
  requestOrigin?: string;
  metadata?: Readonly<Record<string, unknown>> | null;
  /** When true, emit completed/failed notifications (await durable persist). */
  notify?: boolean;
  formats?: DeliverableFormat[];
}): Promise<ServerWordExportResult> {
  const wantsWord = assignmentRequestsWordFile(
    input.assignment,
    input.metadata,
  );
  if (!wantsWord) {
    return { attempted: false, ok: true, files: [] };
  }

  const started = Date.now();
  const jobId =
    input.jobId ??
    `word_${input.requestId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;

  const fail = async (
    reason: string,
    files: Deliverable[] = [],
    stack?: string | null,
  ): Promise<Extract<ServerWordExportResult, { ok: false }>> => {
    const userTitle = wordFailureTitle(reason);
    const userMessage = wordFailureUserMessage(reason);
    const isTimeout = classifyDeliverableError(reason) === "timeout";
    const mapped = mapWordExportReasonToStage(reason);
    const commanderRunId = input.result.commanderRunId ?? input.requestId;
    const projectId = commanderRunId ? `commander-${commanderRunId}` : null;
    const workJobId =
      typeof input.metadata?.jobId === "string"
        ? input.metadata.jobId
        : typeof input.metadata?.workJobId === "string"
          ? input.metadata.workJobId
          : null;
    const generationFailure = createGenerationFailureDiagnostic({
      failedStage: mapped.failedStage,
      errorCode: mapped.errorCode,
      userMessage,
      developerMessage: reason,
      requestId: input.requestId,
      workJobId,
      commanderRunId,
      projectId,
      retryable: mapped.retryable,
      lastSuccessStage: mapped.lastSuccessStage,
      storageError: /storage/i.test(reason) ? reason : null,
      exportError: reason,
    });
    logWordPipeline({
      stage: isTimeout ? "TIMEOUT" : "FAILED",
      ok: false,
      jobId,
      userId: input.userId,
      requestId: input.requestId,
      error: reason,
      stack: stack ?? null,
      detail: `${userTitle}|failedStage=${mapped.failedStage}|diagnosticId=${generationFailure.diagnosticId}`,
      durationMs: Date.now() - started,
    });
    if (input.notify !== false) {
      await notifyWorkFailed(input.userId, {
        title: userTitle,
        message: `${userMessage}（jobId: ${jobId}）`,
        requestId: `${input.requestId}:word`,
        deliverableId: input.result.commanderRunId
          ? `commander-${input.result.commanderRunId}`
          : null,
      });
      await persistNotificationsNow(input.userId).catch(() => undefined);
    }
    return {
      attempted: true,
      ok: false,
      reason,
      userMessage,
      userTitle,
      files,
      jobId,
      stack: stack ?? null,
      failedStage: mapped.failedStage,
      generationFailure,
    };
  };

  try {
    logWordPipeline({
      stage: "WORD_EXPORT_STARTED",
      jobId,
      userId: input.userId,
      requestId: input.requestId,
    });

    const { text: raw, source } = resolveExportSourceText(input.result);
    if (!raw) {
      return fail(`word_export_empty_content:source=${source}`);
    }

    const guard = assertSafeExportText(raw);
    if (!guard.ok) {
      return fail(guard.rejectedReason || "unsafe_export_text");
    }

    const formats: DeliverableFormat[] =
      input.formats && input.formats.length > 0 ? input.formats : ["docx"];

    const generated = await generateDeliverables(
      {
        assignment: input.assignment,
        finalDeliverable: guard.text,
        title: input.assignment.trim().slice(0, 80),
        formats,
      },
      input.requestOrigin ?? "https://atlasapp.jp",
      {
        userId: input.userId,
        jobId,
        // Notification is owned by this helper / commander — engine skips duplicate.
        suppressWordReadyNotification: true,
        // Orchestration already produced approved text — do not re-fail on soft quality.
        contentAlreadyApproved: true,
      },
    );

    const docx = generated.deliverables.find((d) => d.format === "docx");
    if (!docx) {
      const reason =
        generated.failures.map((f) => f.reasons.join(",")).join(";") ||
        "docx_not_produced";
      return fail(reason, generated.deliverables);
    }

    // completed only when download URL exists and points at our API.
    if (!docx.downloadUrl?.includes(`/api/deliverables/${docx.id}`)) {
      return fail("docx_download_url_invalid", generated.deliverables);
    }

    logWordPipeline({
      stage: "DOCX_GENERATED",
      jobId,
      userId: input.userId,
      requestId: input.requestId,
      deliverableId: docx.id,
      durationMs: Date.now() - started,
    });
    logWordPipeline({
      stage: "STORAGE_SAVED",
      jobId,
      userId: input.userId,
      deliverableId: docx.id,
      requestId: input.requestId,
    });
    logWordPipeline({
      stage: "DB_METADATA_SAVED",
      jobId,
      userId: input.userId,
      deliverableId: docx.id,
      requestId: input.requestId,
    });
    logWordPipeline({
      stage: "STATUS_COMPLETED",
      jobId,
      userId: input.userId,
      deliverableId: docx.id,
      requestId: input.requestId,
    });

    if (input.notify !== false) {
      await notifyWorkCompleted(input.userId, {
        title: "Wordファイルの準備ができました",
        message: `「${docx.fileName}」を作成しました。通知から開いてダウンロードできます。`,
        actionUrl: docx.downloadUrl,
        relatedTaskId: docx.id,
        deliverableId: docx.id,
        requestId: `${input.requestId}:word`,
      });
      await persistNotificationsNow(input.userId).catch(() => undefined);
      logWordPipeline({
        stage: "NOTIFICATION_CREATED",
        jobId,
        userId: input.userId,
        deliverableId: docx.id,
        requestId: input.requestId,
      });
      logWordPipeline({
        stage: "UNREAD_COUNT_READY",
        jobId,
        userId: input.userId,
        deliverableId: docx.id,
        requestId: input.requestId,
      });
    }

    return {
      attempted: true,
      ok: true,
      docx,
      files: generated.deliverables,
      downloadUrl: docx.downloadUrl,
      jobId,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "word_export_exception";
    const stack = error instanceof Error ? error.stack : null;
    // Never swallow — log full Error.message + stack for Vercel.
    console.error(
      "[word_pipeline] exportWordDeliverableOnServer exception",
      { jobId, reason, stack },
    );
    return fail(reason, [], stack);
  }
}
