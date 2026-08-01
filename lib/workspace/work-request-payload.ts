/**
 * Single source of truth for work-request submit payloads.
 * Home and 「お願いする」 MUST use this builder — no home-specific metadata.
 */

export type RequestExecutionMode = "once" | "recurring" | "delegate";
export type RequestPriority = "low" | "normal" | "high";

export type PreferredDeliverableFormat =
  | "auto"
  | "xlsx"
  | "docx"
  | "pdf"
  | "pptx"
  | "txt";

export type WorkRequestDocumentExtract = {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  pageOrSheetCount?: number | null;
  extractedText: string;
  warnings?: string[];
};

export type WorkRequestSubmitPayload = {
  assignment: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type BuildWorkRequestSubmitInput = {
  assignment: string;
  attachmentIds?: readonly string[];
  documents?: readonly WorkRequestDocumentExtract[];
  preferredFormat?: PreferredDeliverableFormat;
};

const PENDING_WORK_REQUEST_KEY = "atlas.pendingWorkRequestSubmit";

/** Append extracted document text to the assignment (same for home + workspace). */
export function appendDocumentExtractsToAssignment(
  assignment: string,
  documents: readonly WorkRequestDocumentExtract[],
): string {
  const trimmed = assignment.trim();
  if (documents.length === 0) return trimmed;

  const documentBlock = [
    "",
    "【添付ファイルの抽出テキスト】",
    ...documents.map((doc, index) =>
      [
        `--- ファイル${index + 1}: ${doc.fileName} (${doc.mimeType}) ---`,
        doc.extractedText,
      ].join("\n"),
    ),
  ].join("\n");

  return `${trimmed}${documentBlock}`;
}

/**
 * Build the exact POST /api/work/jobs body fields used by WorkRequestForm.
 * Home must call this — do not invent a second metadata shape.
 */
export function buildWorkRequestSubmitPayload(
  input: BuildWorkRequestSubmitInput,
): WorkRequestSubmitPayload {
  const attachmentIds = (input.attachmentIds ?? []).filter(
    (id) => typeof id === "string" && id.trim().length > 0,
  );
  const documents = input.documents ?? [];
  const preferredFormat = input.preferredFormat ?? "auto";

  return {
    assignment: appendDocumentExtractsToAssignment(input.assignment, documents),
    metadata: {
      requestUi: "secretary_zero_friction_v1",
      executionPreference: "once" satisfies RequestExecutionMode,
      priority: "normal" satisfies RequestPriority,
      skipWorkMemory: false,
      preferredDeliverableFormat: preferredFormat,
      requireVisionSuccess: attachmentIds.length > 0,
      ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      ...(documents.length > 0
        ? {
            documentExtracts: documents.map((doc) => ({
              id: doc.id,
              fileName: doc.fileName,
              mimeType: doc.mimeType,
              bytes: doc.bytes,
              pageOrSheetCount: doc.pageOrSheetCount ?? null,
            })),
          }
        : {}),
    },
  };
}

/** Stash a complete submit payload for workspace autostart (home → workspace). */
export function stashPendingWorkRequestSubmit(
  payload: WorkRequestSubmitPayload,
): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    PENDING_WORK_REQUEST_KEY,
    JSON.stringify(payload),
  );
}

/** Consume a stashed submit payload once (home autostart handoff). */
export function consumePendingWorkRequestSubmit(): WorkRequestSubmitPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_WORK_REQUEST_KEY);
    window.sessionStorage.removeItem(PENDING_WORK_REQUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const assignment = (parsed as { assignment?: unknown }).assignment;
    const metadata = (parsed as { metadata?: unknown }).metadata;
    if (typeof assignment !== "string" || !assignment.trim()) return null;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return null;
    }
    return {
      assignment: assignment.trim(),
      metadata: metadata as Readonly<Record<string, unknown>>,
    };
  } catch {
    return null;
  }
}
