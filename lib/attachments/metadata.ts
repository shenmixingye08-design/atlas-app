import type {
  AttachmentMetadataItem,
  ImageDetailLevel,
} from "./types";
import {
  ATTACHMENT_CONTENT_NOTE_KEY,
  ATTACHMENTS_METADATA_KEY,
  MAX_VISION_IMAGES,
} from "./types";

export function isImageMimeType(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && mimeType.toLowerCase().startsWith("image/"));
}

export function isImageAttachment(item: AttachmentMetadataItem): boolean {
  if (isImageMimeType(item.mimeType)) return true;
  if (item.kind === "photo") return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif|tiff?)$/i.test(item.name);
}

export function readAttachmentsFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): AttachmentMetadataItem[] {
  const raw = metadata?.[ATTACHMENTS_METADATA_KEY];
  if (!Array.isArray(raw)) return [];

  const items: AttachmentMetadataItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    if (!name) continue;

    items.push({
      name,
      kind: typeof record.kind === "string" ? record.kind : "other",
      mimeType: typeof record.mimeType === "string" ? record.mimeType : null,
      size: typeof record.size === "number" ? record.size : 0,
      contentAvailable: record.contentAvailable === true,
      storageId:
        typeof record.storageId === "string" ? record.storageId : null,
      imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : null,
      fetchFailed: record.fetchFailed === true,
      note: typeof record.note === "string" ? record.note : null,
    });
  }
  return items;
}

/** Available image attachments that can be sent as input_image (capped). */
export function readAvailableImageAttachments(
  metadata: Readonly<Record<string, unknown>> | undefined,
): AttachmentMetadataItem[] {
  return readAttachmentsFromMetadata(metadata)
    .filter(
      (item) =>
        isImageAttachment(item) &&
        item.contentAvailable &&
        !item.fetchFailed &&
        (Boolean(item.storageId) || Boolean(item.imageUrl)),
    )
    .slice(0, MAX_VISION_IMAGES);
}

export function hasFailedImageAttachments(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  return readAttachmentsFromMetadata(metadata).some(
    (item) => isImageAttachment(item) && item.fetchFailed,
  );
}

export function resolveImageDetailLevel(
  metadata: Readonly<Record<string, unknown>> | undefined,
): ImageDetailLevel {
  const cost = metadata?.costOptimization;
  if (cost && typeof cost === "object") {
    const mode = (cost as Record<string, unknown>).executionMode;
    if (mode === "eco") return "low";
  }
  const sales = metadata?.salesMaterial;
  if (sales && typeof sales === "object") {
    const costMode = (sales as Record<string, unknown>).costMode;
    if (costMode === "low") return "low";
  }
  return "auto";
}

export function buildAttachmentContentNote(
  items: readonly AttachmentMetadataItem[],
): string | null {
  const failedImages = items.filter(
    (item) => isImageAttachment(item) && item.fetchFailed,
  );
  if (failedImages.length > 0) {
    return "画像の取得に失敗しました";
  }
  return null;
}

export function buildAttachmentsMetadataPayload(
  items: readonly AttachmentMetadataItem[],
): Record<string, unknown> {
  const note = buildAttachmentContentNote(items);
  return {
    [ATTACHMENTS_METADATA_KEY]: items,
    [ATTACHMENT_CONTENT_NOTE_KEY]: note,
  };
}
