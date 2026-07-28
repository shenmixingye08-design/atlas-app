import "server-only";

import { getDeliverableExportText } from "@/lib/orchestration/final-deliverable";
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
import type { Deliverable, DeliverableFormat } from "./types";

export { assignmentRequestsWordFile };

export type ServerWordExportResult =
  | {
      attempted: true;
      ok: true;
      docx: Deliverable;
      files: Deliverable[];
      downloadUrl: string;
    }
  | {
      attempted: true;
      ok: false;
      reason: string;
      files: Deliverable[];
    }
  | { attempted: false; ok: true; files: [] };

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
  logWordPipeline({
    stage: "WORD_EXPORT_STARTED",
    jobId: input.jobId,
    userId: input.userId,
    requestId: input.requestId,
  });

  const raw = getDeliverableExportText(input.result.deliverable).trim();
  if (!raw) {
    const reason = "word_export_empty_content";
    logWordPipeline({
      stage: "FAILED",
      ok: false,
      jobId: input.jobId,
      userId: input.userId,
      requestId: input.requestId,
      error: reason,
    });
    if (input.notify !== false) {
      notifyWorkFailed(input.userId, {
        title: "Wordファイルを作成できませんでした",
        message: "文書本文が空のため、Wordファイルを保存できませんでした。",
        requestId: `${input.requestId}:word`,
        deliverableId: input.result.commanderRunId
          ? `commander-${input.result.commanderRunId}`
          : null,
      });
      await persistNotificationsNow(input.userId).catch(() => undefined);
    }
    return { attempted: true, ok: false, reason, files: [] };
  }

  const guard = assertSafeExportText(raw);
  if (!guard.ok) {
    const reason = guard.rejectedReason;
    logWordPipeline({
      stage: "FAILED",
      ok: false,
      jobId: input.jobId,
      userId: input.userId,
      requestId: input.requestId,
      error: reason,
    });
    if (input.notify !== false) {
      notifyWorkFailed(input.userId, {
        title: "Wordファイルを作成できませんでした",
        message: guard.safeMessage,
        requestId: `${input.requestId}:word`,
      });
      await persistNotificationsNow(input.userId).catch(() => undefined);
    }
    return { attempted: true, ok: false, reason, files: [] };
  }

  const formats: DeliverableFormat[] =
    input.formats && input.formats.length > 0
      ? input.formats
      : ["docx"];

  try {
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
        jobId: input.jobId ?? `word_${input.requestId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`,
        // Notification is owned by this helper / commander — engine skips duplicate.
        suppressWordReadyNotification: true,
      },
    );

    const docx = generated.deliverables.find((d) => d.format === "docx");
    if (!docx) {
      const reason =
        generated.failures.map((f) => f.reasons.join(",")).join(";") ||
        "docx_not_produced";
      logWordPipeline({
        stage: "FAILED",
        ok: false,
        jobId: input.jobId,
        userId: input.userId,
        requestId: input.requestId,
        error: reason,
        durationMs: Date.now() - started,
      });
      if (input.notify !== false) {
        notifyWorkFailed(input.userId, {
          title: "Wordファイルを作成できませんでした",
          message:
            "文書内容は作成できましたが、Wordファイルの保存に失敗しました。もう一度お試しください。",
          requestId: `${input.requestId}:word`,
        });
        await persistNotificationsNow(input.userId).catch(() => undefined);
      }
      return {
        attempted: true,
        ok: false,
        reason,
        files: generated.deliverables,
      };
    }

    // completed only when download URL exists and points at our API.
    if (!docx.downloadUrl?.includes(`/api/deliverables/${docx.id}`)) {
      const reason = "docx_download_url_invalid";
      logWordPipeline({
        stage: "FAILED",
        ok: false,
        jobId: input.jobId,
        userId: input.userId,
        requestId: input.requestId,
        deliverableId: docx.id,
        error: reason,
      });
      if (input.notify !== false) {
        notifyWorkFailed(input.userId, {
          title: "Wordファイルを作成できませんでした",
          message: "保存は完了しましたが、ダウンロード用のURLを確認できませんでした。",
          requestId: `${input.requestId}:word`,
          deliverableId: docx.id,
        });
        await persistNotificationsNow(input.userId).catch(() => undefined);
      }
      return {
        attempted: true,
        ok: false,
        reason,
        files: generated.deliverables,
      };
    }

    logWordPipeline({
      stage: "DOCX_GENERATED",
      jobId: input.jobId,
      userId: input.userId,
      requestId: input.requestId,
      deliverableId: docx.id,
      durationMs: Date.now() - started,
    });
    logWordPipeline({
      stage: "STORAGE_SAVED",
      jobId: input.jobId,
      userId: input.userId,
      deliverableId: docx.id,
      requestId: input.requestId,
    });
    logWordPipeline({
      stage: "DB_METADATA_SAVED",
      jobId: input.jobId,
      userId: input.userId,
      deliverableId: docx.id,
      requestId: input.requestId,
    });
    logWordPipeline({
      stage: "STATUS_COMPLETED",
      jobId: input.jobId,
      userId: input.userId,
      deliverableId: docx.id,
      requestId: input.requestId,
    });

    if (input.notify !== false) {
      notifyWorkCompleted(input.userId, {
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
        jobId: input.jobId,
        userId: input.userId,
        deliverableId: docx.id,
        requestId: input.requestId,
      });
      logWordPipeline({
        stage: "UNREAD_COUNT_READY",
        jobId: input.jobId,
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
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "word_export_exception";
    const isTimeout = /timeout|ETIMEDOUT|aborted|maxDuration/i.test(reason);
    logWordPipeline({
      stage: isTimeout ? "TIMEOUT" : "FAILED",
      ok: false,
      jobId: input.jobId,
      userId: input.userId,
      requestId: input.requestId,
      error: reason,
      durationMs: Date.now() - started,
    });
    if (input.notify !== false) {
      notifyWorkFailed(input.userId, {
        title: isTimeout
          ? "Word作成がタイムアウトしました"
          : "Wordファイルを作成できませんでした",
        message: isTimeout
          ? "処理時間の上限に達しました。もう一度お試しください。"
          : reason.slice(0, 200),
        requestId: `${input.requestId}:word`,
      });
      await persistNotificationsNow(input.userId).catch(() => undefined);
    }
    return { attempted: true, ok: false, reason, files: [] };
  }
}
