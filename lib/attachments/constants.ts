/** Private Supabase Storage bucket for user images (Vision). */
export const ATLAS_IMAGE_ATTACHMENTS_BUCKET = "atlas-image-attachments";

/** Short-lived signed URL TTL when a URL is unavoidable (seconds). */
export const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60;

export type AttachmentRetentionPolicy = "temporary" | "retained";

export type AttachmentStorageBackend = "local" | "supabase";
