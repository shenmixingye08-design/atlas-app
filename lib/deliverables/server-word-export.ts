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

import { assignmentRequestsWordFile } from "./detect-formats";
import { generateDeliverables } from "./engine";
import { logWordPipeline } from "./pipeline-log";
import {
  classifyDeliverableError,
  wordFailureTitle,
  wordFailureUserMessage,
} from "./recovery-messages";
import type { Deliverable, DeliverableFormat } from "./types";
import {
  classifyWordPipelineFailure,
  verifyWordCompletion,
  type WordCompletionReport,
} from "./word-completion-gate";

export { assignmentRequestsWordFile };

export type ServerWordExportResult =
  | {
      attempted: true;
      ok: true;
      docx: Deliverable;
      files: Deliverable[];
      downloadUrl: string;
      jobId: string;
      completion: WordCompletionReport;
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
      errorCode?: string;
      completion?: WordCompletionReport | null;
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
 * Returns ok only when the formal 11-step completion gate passes.
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
  workJobId?: string | null;
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
    completion?: WordCompletionReport | null,
  ): Promise<Extract<ServerWordExportResult, { ok: false }>> => {
    const errorCode =
      completion?.errorCode ?? classifyWordPipelineFailure(reason);
    const userTitle = wordFailureTitle(reason);
    const userMessage = wordFailureUserMessage(reason);
    const isTimeout =
      errorCode === "TIMEOUT" ||
      classifyDeliverableError(reason) === "timeout";
    logWordPipeline({
      stage: isTimeout ? "TIMEOUT" : "FAILED",
      ok: false,
      jobId,
      userId: input.userId,
      requestId: input.requestId,
      error: reason,
      stack: stack ?? null,
      detail: `${userTitle};code=${errorCode}`,
      durationMs: Date.now() - started,
    });
    if (input.notify !== false) {
      const projectTarget = input.result.commanderRunId
        ? `commander-${input.result.commanderRunId}`
        : null;
      notifyWorkFailed(input.userId, {
        title: userTitle,
        message: `${userMessage}（jobId: ${jobId}）`,
        requestId: `${input.requestId}:word`,
        relatedTaskId: projectTarget,
        deliverableId: projectTarget,
      });
      try {
        await persistNotificationsNow(input.userId);
      } catch (error) {
        console.error(
          "[word_pipeline] notification_persist_failed",
          error instanceof Error ? error.message : error,
        );
      }
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
      errorCode,
      completion: completion ?? null,
    };
  };

  try {
    logWordPipeline({
      stage: "WORD_EXPORT_STARTED",
      jobId,
      userId: input.userId,
      requestId: input.requestId,
    });

    if (!input.userId.trim()) {
      return fail("AUTHENTICATION_FAILED:missing_user");
    }

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

    const projectTarget = input.result.commanderRunId
      ? `commander-${input.result.commanderRunId}`
      : null;

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
        notificationTargetId: projectTarget,
        // Notification is owned by this helper / commander — engine skips duplicate.
        suppressWordReadyNotification: true,
        // Orchestration already produced approved text — do not re-fail on soft quality.
        contentAlreadyApproved: true,
        workJobId: input.workJobId ?? null,
        commanderRunId: input.result.commanderRunId ?? input.requestId,
      },
    );

    const docx = generated.deliverables.find((d) => d.format === "docx");
    if (!docx) {
      const reason =
        generated.failures.map((f) => f.reasons.join(",")).join(";") ||
        "docx_not_produced";
      return fail(reason, generated.deliverables);
    }

    // Formal 11-step gate — completed is forbidden until every check passes.
    const completion = await verifyWordCompletion({
      userId: input.userId,
      jobId,
      requestValidated: true,
      aiContentReady: true,
      deliverableId: docx.id,
      expectedWorkJobId: input.workJobId ?? null,
      expectedCommanderRunId: input.result.commanderRunId ?? input.requestId,
    });

    if (!completion.ok) {
      return fail(
        `word_completion_gate:${completion.failedStep}:${completion.internalError}`,
        generated.deliverables,
        null,
        completion,
      );
    }

    // Prefer gate-verified metadata (non-zero size, canonical MIME/name).
    const verifiedDocx: Deliverable = {
      ...docx,
      fileName: completion.fileName ?? docx.fileName,
      mimeType: completion.mimeType ?? docx.mimeType,
      sizeBytes: completion.sizeBytes,
      downloadUrl: completion.downloadUrl ?? docx.downloadUrl,
    };

    logWordPipeline({
      stage: "DOCX_GENERATED",
      jobId,
      userId: input.userId,
      requestId: input.requestId,
      deliverableId: verifiedDocx.id,
      durationMs: Date.now() - started,
      detail: `bytes=${completion.sizeBytes}`,
    });
    logWordPipeline({
      stage: "STORAGE_SAVED",
      jobId,
      userId: input.userId,
      deliverableId: verifiedDocx.id,
      requestId: input.requestId,
      detail: `key=${completion.storageKey}`,
    });
    logWordPipeline({
      stage: "DB_METADATA_SAVED",
      jobId,
      userId: input.userId,
      deliverableId: verifiedDocx.id,
      requestId: input.requestId,
    });
    logWordPipeline({
      stage: "STATUS_COMPLETED",
      jobId,
      userId: input.userId,
      deliverableId: verifiedDocx.id,
      requestId: input.requestId,
      detail: "word_completion_gate_ok",
    });

    if (input.notify !== false) {
      // CRITICAL: target the commander project (or wordfile-{uuid}), never the
      // raw .docx UUID alone — /results loads Project rows, not file rows.
      const notifyTarget = projectTarget ?? `wordfile-${verifiedDocx.id}`;
      notifyWorkCompleted(input.userId, {
        title: "Wordファイルの準備ができました",
        message: `「${verifiedDocx.fileName}」を作成しました。通知から開いてダウンロードできます。`,
        actionUrl: verifiedDocx.downloadUrl,
        relatedTaskId: notifyTarget,
        deliverableId: notifyTarget,
        requestId: `${input.requestId}:word`,
      });
      try {
        await persistNotificationsNow(input.userId);
        logWordPipeline({
          stage: "NOTIFICATION_CREATED",
          jobId,
          userId: input.userId,
          deliverableId: verifiedDocx.id,
          requestId: input.requestId,
          detail: `target=${notifyTarget}`,
        });
        logWordPipeline({
          stage: "UNREAD_COUNT_READY",
          jobId,
          userId: input.userId,
          deliverableId: verifiedDocx.id,
          requestId: input.requestId,
        });
      } catch (error) {
        console.error(
          "[word_pipeline] notification_persist_failed",
          error instanceof Error ? error.message : error,
        );
        logWordPipeline({
          stage: "FAILED",
          ok: false,
          jobId,
          userId: input.userId,
          deliverableId: verifiedDocx.id,
          requestId: input.requestId,
          error: "notification_persist_failed",
          detail: "通知失敗",
        });
      }
    }

    return {
      attempted: true,
      ok: true,
      docx: verifiedDocx,
      files: generated.deliverables.map((f) =>
        f.id === verifiedDocx.id ? verifiedDocx : f,
      ),
      downloadUrl: verifiedDocx.downloadUrl,
      jobId,
      completion,
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
