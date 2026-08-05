import "server-only";

import type { OrchestrationResult } from "@/lib/orchestration/types";

import { assignmentRequestsWordFile } from "./detect-formats";
import {
  exportDocumentsOnServer,
  type ServerDocumentExportResult,
} from "./server-document-export";
import type { Deliverable, DeliverableFormat } from "./types";

export { assignmentRequestsWordFile };
export { exportDocumentsOnServer } from "./server-document-export";

/**
 * Backward-compatible Word-focused result shape.
 * P0-7: delegates to unified {@link exportDocumentsOnServer}.
 */
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
    }
  | { attempted: false; ok: true; files: [] };

function toWordResult(
  result: ServerDocumentExportResult,
): ServerWordExportResult {
  if (!result.attempted) {
    return { attempted: false, ok: true, files: [] };
  }
  if (!result.ok) {
    return {
      attempted: true,
      ok: false,
      reason: result.reason,
      userMessage: result.userMessage,
      userTitle: result.userTitle,
      files: result.files,
      jobId: result.jobId,
      stack: result.stack,
    };
  }
  const docx = result.files.find((f) => f.format === "docx");
  if (!docx) {
    return {
      attempted: true,
      ok: false,
      reason: "docx_not_produced",
      userMessage: "Wordファイルを作成できませんでした。",
      userTitle: "Word生成失敗",
      files: result.files,
      jobId: result.jobId,
    };
  }
  return {
    attempted: true,
    ok: true,
    docx,
    files: result.files,
    downloadUrl: result.downloadUrl,
    jobId: result.jobId,
  };
}

/**
 * Server-side Word export after orchestration text is ready.
 * P0-7: uses the unified document pipeline under the hood.
 * Prefer {@link exportDocumentsOnServer} for multi-format Home/お願い parity.
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
  if (!wantsWord && !(input.formats && input.formats.length > 0)) {
    return { attempted: false, ok: true, files: [] };
  }

  const formats: DeliverableFormat[] =
    input.formats && input.formats.length > 0 ? input.formats : ["docx"];

  const exported = await exportDocumentsOnServer({
    ...input,
    formats,
  });
  return toWordResult(exported);
}
