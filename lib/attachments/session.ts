import type { AttachmentMetadataItem } from "./types";
import { buildAttachmentsMetadataPayload } from "./metadata";

const STORAGE_KEY = "atlas.pendingAttachments.v1";

export type PendingAttachmentSession = {
  id: string;
  createdAt: string;
  attachments: AttachmentMetadataItem[];
};

export function savePendingAttachments(
  attachments: AttachmentMetadataItem[],
): string {
  const id = crypto.randomUUID();
  const payload: PendingAttachmentSession = {
    id,
    createdAt: new Date().toISOString(),
    attachments,
  };

  try {
    sessionStorage.setItem(
      `${STORAGE_KEY}:${id}`,
      JSON.stringify(payload),
    );
  } catch {
    // sessionStorage may be unavailable; caller still has assignment text.
  }

  return id;
}

export function loadPendingAttachments(
  id: string | null | undefined,
): AttachmentMetadataItem[] {
  if (!id || typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}:${id}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingAttachmentSession;
    if (!Array.isArray(parsed.attachments)) return [];
    return parsed.attachments;
  } catch {
    return [];
  }
}

export function clearPendingAttachments(id: string | null | undefined): void {
  if (!id || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`${STORAGE_KEY}:${id}`);
  } catch {
    // ignore
  }
}

export function buildMetadataFromPendingAttachments(
  id: string | null | undefined,
): Record<string, unknown> {
  const attachments = loadPendingAttachments(id);
  if (attachments.length === 0) return {};
  return buildAttachmentsMetadataPayload(attachments);
}
