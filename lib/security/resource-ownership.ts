import "server-only";

import { getDeliverableArtifact, getDocumentModel } from "@/lib/documents/storage/document-store";
import { getStoredDeliverable } from "@/lib/deliverables/store";

/** Returns false when the stored resource belongs to another user. Null owner = legacy dev rows. */
export function isResourceOwnedByUser(
  ownerUserId: string | null | undefined,
  requestUserId: string,
): boolean {
  if (!ownerUserId) return true;
  return ownerUserId === requestUserId;
}

export function assertDeliverableDownloadAccess(input: {
  deliverableId: string;
  userId: string;
}): { ok: true; buffer: Buffer; mimeType: string; fileName: string } | { ok: false; status: 403 | 404 | 422; error: string } {
  const artifact = getDeliverableArtifact(input.deliverableId);
  if (artifact) {
    if (!isResourceOwnedByUser(artifact.userId, input.userId)) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    if (artifact.sizeBytes <= 0 || !artifact.validationPassed) {
      return { ok: false, status: 422, error: "Deliverable failed validation" };
    }
    return {
      ok: true,
      buffer: artifact.buffer,
      mimeType: artifact.mimeType,
      fileName: artifact.fileName,
    };
  }

  const stored = getStoredDeliverable(input.deliverableId);
  if (!stored) {
    return { ok: false, status: 404, error: "Deliverable not found or expired" };
  }
  if (!isResourceOwnedByUser(stored.userId ?? null, input.userId)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (stored.buffer.byteLength <= 0 || stored.validationPassed === false) {
    return { ok: false, status: 422, error: "Deliverable failed validation" };
  }

  return {
    ok: true,
    buffer: stored.buffer,
    mimeType: stored.mimeType,
    fileName: stored.fileName,
  };
}

export function assertDocumentModelAccess(input: {
  documentModelId: string;
  userId: string;
}): { ok: true } | { ok: false; status: 403 | 404; error: string } {
  const stored = getDocumentModel(input.documentModelId);
  if (!stored) {
    return { ok: false, status: 404, error: "Not found" };
  }
  if (!isResourceOwnedByUser(stored.userId, input.userId)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}
