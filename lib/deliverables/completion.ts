import { DELIVERABLE_MIME_TYPES } from "./types";
import type { Deliverable, DeliverableFormat } from "./types";
import type { StoredDeliverable } from "./store";

const DOCX_MIME =
  DELIVERABLE_MIME_TYPES.docx.split(";")[0]!.trim().toLowerCase();

export type WordCompletionCheck = {
  ok: boolean;
  reasons: string[];
};

function isPkZip(buffer: Buffer | Uint8Array): boolean {
  return buffer.byteLength >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/**
 * Strict Word completed criteria — all must pass before treating as completed.
 * Notification success is intentionally NOT required.
 */
export function assertWordDeliverableComplete(input: {
  format: DeliverableFormat;
  buffer: Buffer | Uint8Array | null | undefined;
  mimeType: string;
  fileName: string;
  verified: boolean;
  saved: boolean;
  deliverableId: string | null | undefined;
  downloadUrl: string | null | undefined;
  ownerUserId: string;
  expectedUserId: string;
  listed: boolean;
}): WordCompletionCheck {
  const reasons: string[] = [];

  if (input.format !== "docx") reasons.push("format_not_docx");
  if (!input.buffer || input.buffer.byteLength === 0) {
    reasons.push("buffer_missing");
  } else {
    if (input.buffer.byteLength < 1_500) reasons.push("size_below_1500");
    if (!isPkZip(input.buffer)) reasons.push("missing_pk_header");
  }

  const mime = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime !== DOCX_MIME) reasons.push("mime_mismatch");

  if (!input.fileName.toLowerCase().endsWith(".docx")) {
    reasons.push("filename_not_docx");
  }
  if (/\.docx\.docx$/i.test(input.fileName)) {
    reasons.push("double_extension");
  }
  if (!input.verified) reasons.push("verify_failed");
  if (!input.saved) reasons.push("not_saved");
  if (!input.deliverableId?.trim()) reasons.push("missing_deliverable_id");
  if (!input.downloadUrl?.trim()) reasons.push("missing_download_url");
  if (input.ownerUserId !== input.expectedUserId) {
    reasons.push("owner_mismatch");
  }
  if (!input.listed) reasons.push("not_listed");

  return { ok: reasons.length === 0, reasons };
}

/** Metadata-level check after store (buffer already verified during generate). */
export function isListedWordDeliverableComplete(
  meta: Deliverable,
  expectedUserId: string,
  ownerUserId: string,
): boolean {
  return (
    meta.format === "docx" &&
    meta.sizeBytes >= 1_500 &&
    meta.mimeType.split(";")[0]!.trim().toLowerCase() === DOCX_MIME &&
    meta.fileName.toLowerCase().endsWith(".docx") &&
    Boolean(meta.id.trim()) &&
    Boolean(meta.downloadUrl.trim()) &&
    ownerUserId === expectedUserId
  );
}

export function storedWordLooksComplete(
  stored: StoredDeliverable,
  expectedUserId: string,
): boolean {
  return assertWordDeliverableComplete({
    format: stored.format,
    buffer: stored.buffer,
    mimeType: stored.mimeType,
    fileName: stored.fileName,
    verified: true,
    saved: true,
    deliverableId: stored.id,
    downloadUrl: `/api/deliverables/${stored.id}`,
    ownerUserId: stored.userId,
    expectedUserId,
    listed: true,
  }).ok;
}
