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
  classifyNotificationPersistError,
  logAutomationNotificationPersistence,
} from "@/lib/notifications/persist-log";
import {
  artifactCompletedCopy,
  inferArtifactKindFromFileName,
} from "@/lib/notifications/user-facing-copy";

import type { ArtifactCompletionEvidence } from "./artifact-contract";
import { hasVerifiedArtifactEvidence } from "./artifact-persist";
import {
  createDocumentPipelineJob,
  pipelineHasCompleteArtifacts,
  updateDocumentPipelineJob,
  type DocumentPipelineJob,
} from "./durable-document-pipeline";
import { generateDeliverables } from "./engine";
import { logWordPipeline } from "./pipeline-log";
import {
  classifyDeliverableError,
  wordFailureTitle,
  wordFailureUserMessage,
} from "./recovery-messages";
import { loadDurableDeliverable } from "./durable-store";
import { resolveRequestedExportFormats } from "./resolve-requested-export-formats";
import { getStoredDeliverableForUser } from "./store";
import type { Deliverable, DeliverableFormat } from "./types";

export type ServerDocumentExportResult =
  | {
      attempted: true;
      ok: true;
      files: Deliverable[];
      formats: DeliverableFormat[];
      downloadUrl: string;
      jobId: string;
      pipelineJob: DocumentPipelineJob;
      evidences: ArtifactCompletionEvidence[];
    }
  | {
      attempted: true;
      ok: false;
      reason: string;
      userMessage: string;
      userTitle: string;
      files: Deliverable[];
      formats: DeliverableFormat[];
      jobId: string;
      pipelineJob: DocumentPipelineJob | null;
      stack?: string | null;
    }
  | {
      attempted: false;
      ok: true;
      files: [];
      formats: [];
    };

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
    console.error(
      "[document_pipeline] getDeliverableExportText threw",
      error instanceof Error ? error.message : error,
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

function isDownloadable(file: Deliverable): boolean {
  return Boolean(
    file.downloadUrl?.includes(`/api/deliverables/${file.id}`) &&
      file.sizeBytes > 0,
  );
}

/**
 * P0-7 unified server document export for DOCX/XLSX/PDF/PPTX/TXT/MD.
 * Same pipeline for Home and お願い — browser tab must not be required.
 * completed ⇒ every requested format has durable verified artifact.
 */
export async function exportDocumentsOnServer(input: {
  userId: string;
  assignment: string;
  result: OrchestrationResult;
  requestId: string;
  jobId?: string | null;
  workJobId?: string | null;
  requestOrigin?: string;
  metadata?: Readonly<Record<string, unknown>> | null;
  notify?: boolean;
  formats?: DeliverableFormat[];
}): Promise<ServerDocumentExportResult> {
  const resolved = resolveRequestedExportFormats({
    assignment: input.assignment,
    metadata: input.metadata,
    content: undefined,
    overrideFormats: input.formats,
  });

  if (!resolved.required || resolved.formats.length === 0) {
    return { attempted: false, ok: true, files: [], formats: [] };
  }

  const formats = resolved.formats;
  const started = Date.now();
  const jobId =
    input.jobId ??
    `doc_${input.requestId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;

  let pipelineJob: DocumentPipelineJob | null = null;

  const fail = async (
    reason: string,
    files: Deliverable[] = [],
    stack?: string | null,
  ): Promise<Extract<ServerDocumentExportResult, { ok: false }>> => {
    const userTitle = wordFailureTitle(reason);
    const userMessage = wordFailureUserMessage(reason);
    const isTimeout = classifyDeliverableError(reason) === "timeout";
    logWordPipeline({
      stage: isTimeout ? "TIMEOUT" : "FAILED",
      ok: false,
      jobId,
      userId: input.userId,
      requestId: input.requestId,
      error: reason,
      stack: stack ?? null,
      detail: `formats=${formats.join(",")}`,
      durationMs: Date.now() - started,
    });
    if (pipelineJob) {
      pipelineJob = await updateDocumentPipelineJob(jobId, input.userId, {
        status: isTimeout ? "timed_out" : "failed",
        stage: isTimeout ? "timed_out" : "failed",
        errorCode: reason.slice(0, 120),
        errorMessage: reason,
        failedFormats: formats.filter(
          (format) => !files.some((f) => f.format === format && isDownloadable(f)),
        ),
        finishedAt: new Date().toISOString(),
        timedOutAt: isTimeout ? new Date().toISOString() : null,
        progressPct: Math.min(99, pipelineJob.progressPct),
      });
    }
    if (input.notify !== false) {
      await notifyWorkFailed(input.userId, {
        title: userTitle,
        message: `${userMessage}（jobId: ${jobId}）`,
        requestId: `${input.requestId}:documents`,
        deliverableId: input.result.commanderRunId
          ? `commander-${input.result.commanderRunId}`
          : null,
      });
      await persistNotificationsNow(input.userId).catch((error) => {
        logAutomationNotificationPersistence({
          success: false,
          durationMs: 0,
          persistenceTarget: "atlas_user_state",
          userId: input.userId,
          jobId,
          errorCode: classifyNotificationPersistError(error),
          stage: "document_export_persist_blob",
        });
      });
    }
    return {
      attempted: true,
      ok: false,
      reason,
      userMessage,
      userTitle,
      files,
      formats,
      jobId,
      pipelineJob,
      stack: stack ?? null,
    };
  };

  try {
    pipelineJob = await createDocumentPipelineJob({
      ownerUserId: input.userId,
      requestedFormats: formats,
      workJobId: input.workJobId ?? null,
      runId: input.requestId,
      jobId,
    });

    pipelineJob = await updateDocumentPipelineJob(jobId, input.userId, {
      status: "generating",
      stage: "generating",
      progressPct: 10,
    });

    logWordPipeline({
      stage: "WORD_EXPORT_STARTED",
      jobId,
      userId: input.userId,
      requestId: input.requestId,
      detail: `p0-7 formats=${formats.join(",")}`,
    });

    const { text: raw, source } = resolveExportSourceText(input.result);
    if (!raw) {
      return fail(`document_export_empty_content:source=${source}`);
    }

    const guard = assertSafeExportText(raw);
    if (!guard.ok) {
      return fail(guard.rejectedReason || "unsafe_export_text");
    }

    pipelineJob = await updateDocumentPipelineJob(jobId, input.userId, {
      status: "exporting",
      stage: "exporting",
      progressPct: 35,
    });

    // Cancel check mid-flight
    if (pipelineJob.status === "cancelled") {
      return fail("document_pipeline_cancelled");
    }

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
        suppressWordReadyNotification: true,
        contentAlreadyApproved: true,
      },
    );

    pipelineJob = await updateDocumentPipelineJob(jobId, input.userId, {
      status: "verifying",
      stage: "verifying",
      progressPct: 75,
    });

    const files = generated.deliverables;
    const missing = formats.filter(
      (format) => !files.some((f) => f.format === format && isDownloadable(f)),
    );
    if (missing.length > 0) {
      const reason =
        generated.failures.map((f) => f.reasons.join(",")).join(";") ||
        `formats_not_produced:${missing.join(",")}`;
      return fail(reason, files);
    }

    // Re-load each artifact — completed without durable bytes is forbidden.
    const evidences: ArtifactCompletionEvidence[] = [];
    const artifactIds: string[] = [];
    const completionEvidenceIds: string[] = [];
    const checksums: string[] = [];
    const byteSizes: number[] = [];
    const completedFormats: DeliverableFormat[] = [];

    for (const format of formats) {
      const file = files.find((f) => f.format === format);
      if (!file) return fail(`missing_format:${format}`, files);
      const stored = await getStoredDeliverableForUser(file.id, input.userId);
      if (!stored || stored.buffer.byteLength <= 0) {
        return fail(`artifact_missing_bytes:${format}`, files);
      }
      if (stored.buffer.byteLength !== file.sizeBytes) {
        return fail(`artifact_size_mismatch:${format}`, files);
      }
      const durable = await loadDurableDeliverable(file.id, input.userId);
      const evidenceId =
        stored.metadata?.completionEvidenceId ??
        file.metadata?.completionEvidenceId ??
        durable?.metadata?.completionEvidenceId ??
        null;
      const checksum =
        stored.contentSha256 ?? durable?.contentSha256 ?? "";
      if (!checksum || !evidenceId) {
        return fail(`completion_evidence_missing:${format}`, files);
      }
      const storagePath = durable?.storagePath ?? "";
      const evidence: ArtifactCompletionEvidence = {
        completionEvidenceId: evidenceId,
        artifactId: file.id,
        storagePath,
        checksum,
        byteSize: stored.buffer.byteLength,
        verifiedAt: new Date().toISOString(),
        diagnosticId:
          stored.metadata?.diagnosticId ??
          durable?.metadata?.diagnosticId ??
          `diag_${file.id}`,
        resultHash: checksum,
        ownerId: input.userId,
      };
      if (!hasVerifiedArtifactEvidence(evidence)) {
        return fail(`evidence_unverified:${format}`, files);
      }

      evidences.push(evidence);
      artifactIds.push(file.id);
      completionEvidenceIds.push(evidenceId);
      checksums.push(checksum);
      byteSizes.push(stored.buffer.byteLength);
      completedFormats.push(format);
    }

    pipelineJob = await updateDocumentPipelineJob(jobId, input.userId, {
      status: "completed",
      stage: "completed",
      progressPct: 100,
      completedFormats,
      artifactIds,
      completionEvidenceIds,
      checksums,
      byteSizes,
      finishedAt: new Date().toISOString(),
      errorCode: null,
      errorMessage: null,
    });

    if (!pipelineHasCompleteArtifacts(pipelineJob)) {
      return fail("completed_without_full_artifacts", files);
    }

    const primary =
      files.find((f) => f.format === "docx") ??
      files.find((f) => f.format === formats[0]) ??
      files[0]!;

    logWordPipeline({
      stage: "STATUS_COMPLETED",
      jobId,
      userId: input.userId,
      requestId: input.requestId,
      deliverableId: primary.id,
      detail: `p0-7 formats=${completedFormats.join(",")}`,
      durationMs: Date.now() - started,
    });

    if (input.notify !== false) {
      const copy = artifactCompletedCopy(
        inferArtifactKindFromFileName(primary.fileName),
        primary.fileName,
      );
      await notifyWorkCompleted(input.userId, {
        title: copy.title,
        message:
          files.length > 1
            ? `お待たせいたしました。「${primary.fileName}」ほか ${files.length} 件をご用意しました。通知から開いてご確認ください。`
            : copy.message,
        actionUrl: primary.downloadUrl,
        relatedTaskId: primary.id,
        deliverableId: primary.id,
        requestId: `${input.requestId}:documents`,
      });
      await persistNotificationsNow(input.userId).catch((error) => {
        logAutomationNotificationPersistence({
          success: false,
          durationMs: 0,
          persistenceTarget: "atlas_user_state",
          userId: input.userId,
          jobId,
          errorCode: classifyNotificationPersistError(error),
          stage: "document_export_persist_blob",
        });
      });
    }

    return {
      attempted: true,
      ok: true,
      files,
      formats,
      downloadUrl: primary.downloadUrl,
      jobId,
      pipelineJob,
      evidences,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "document_export_exception";
    const stack = error instanceof Error ? error.stack : null;
    console.error("[document_pipeline] exportDocumentsOnServer exception", {
      jobId,
      reason,
      stack,
    });
    return fail(reason, [], stack);
  }
}
