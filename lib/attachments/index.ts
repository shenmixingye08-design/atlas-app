export type {
  AttachmentKind,
  AttachmentMetadataItem,
  ImageDetailLevel,
  StoredAttachment,
} from "./types";
export {
  ATTACHMENTS_METADATA_KEY,
  ATTACHMENT_CONTENT_NOTE_KEY,
  MAX_VISION_IMAGES,
  MAX_IMAGE_UPLOAD_BYTES,
} from "./types";
export {
  buildAttachmentContentNote,
  buildAttachmentsMetadataPayload,
  hasFailedImageAttachments,
  isImageAttachment,
  isImageMimeType,
  readAttachmentsFromMetadata,
  readAvailableImageAttachments,
  resolveImageDetailLevel,
} from "./metadata";
