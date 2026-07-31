/**
 * Stage-by-stage vision pipeline logging.
 * Correlate client + server with `traceId` / `diagnosticId`.
 *
 * Stages (requested):
 * - image_select
 * - formdata_build
 * - attachment_upload (HTTP /api/attachments/images)
 * - storage_read
 * - files_api_before / files_api_after / file_id
 * - responses_payload
 * - openai_response
 * - return_to_frontend
 */

export type VisionPipelineStage =
  | "image_select"
  | "formdata_build"
  | "attachment_upload_before"
  | "attachment_upload_after"
  | "job_metadata"
  | "storage_read"
  | "files_api_before"
  | "files_api_after"
  | "file_id"
  | "responses_payload"
  | "openai_response"
  | "return_to_frontend"
  | "image_dropped";

export type VisionPipelineLogFields = {
  stage: VisionPipelineStage;
  ok?: boolean;
  traceId?: string | null;
  diagnosticId?: string | null;
  jobId?: string | null;
  attachmentId?: string | null;
  attachmentIds?: string[] | null;
  fileName?: string | null;
  mimeType?: string | null;
  byteLength?: number | null;
  fileCount?: number | null;
  formDataHasFiles?: boolean | null;
  fileId?: string | null;
  transport?: "file_id" | "data_url" | null;
  hasInputImage?: boolean | null;
  inputImageKind?: "file_id" | "image_url" | "missing" | null;
  openAiRequestId?: string | null;
  openAiHttpStatus?: number | null;
  openAiErrorCode?: string | null;
  openAiErrorMessage?: string | null;
  outputTextPreview?: string | null;
  headHex32?: string | null;
  dropReason?: string | null;
  [key: string]: string | number | boolean | null | undefined | string[];
};

const PREFIX = "[atlas-vision-pipeline]";

/** Safe for browser + server; never logs raw image bytes / full data URLs. */
export function logVisionPipeline(fields: VisionPipelineLogFields): void {
  const payload = {
    ...fields,
    ts: new Date().toISOString(),
  };
  if (fields.ok === false || fields.stage === "image_dropped") {
    console.error(PREFIX, payload);
    return;
  }
  console.info(PREFIX, payload);
}

export function newVisionTraceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `vtr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  return `vtr_${Date.now().toString(36)}`;
}
