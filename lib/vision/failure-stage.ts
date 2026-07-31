/**
 * Vision pipeline failure stages — shared by server gate payloads and client UI.
 * No image bytes / PII — stage codes and Japanese copy only.
 */

export const VISION_PIPELINE_STAGES = [
  "upload",
  "preprocess",
  "storage_save",
  "storage_download",
  "data_url",
  "vision_request",
  "vision_response",
  "schema_validation",
  "artifact_generation",
  "deliverable_save",
  "artifact_handoff",
  "blocked",
] as const;

export type VisionPipelineStage = (typeof VISION_PIPELINE_STAGES)[number];

/** Short Japanese label for users (which step failed). */
export const VISION_STAGE_USER_LABEL: Record<VisionPipelineStage, string> = {
  upload: "画像の受け取り",
  preprocess: "画像の整理",
  storage_save: "画像の保存",
  storage_download: "画像の読み込み",
  data_url: "資料の準備",
  vision_request: "内容の確認",
  vision_response: "内容の確認",
  schema_validation: "内容の整理",
  artifact_generation: "資料の準備",
  deliverable_save: "保存",
  artifact_handoff: "仕上げ",
  blocked: "処理の停止",
};

/** User-facing explanation — secretary tone; no model/tool jargon. */
export const VISION_STAGE_USER_MESSAGE: Record<VisionPipelineStage, string> = {
  upload: "画像を受け取れませんでした。もう一度選び直してください。",
  preprocess:
    "画像を整えられませんでした。JPEGまたはPNGで送り直してください。",
  storage_save: "画像の保存に失敗しました。もう一度お送りください。",
  storage_download:
    "画像を読み込めませんでした。もう一度お送りください。",
  data_url: "処理を続けています",
  vision_request: "処理を続けています",
  vision_response: "処理を続けています",
  schema_validation: "処理を続けています",
  artifact_generation: "処理を続けています",
  deliverable_save: "処理を続けています",
  artifact_handoff: "処理を続けています",
  blocked: "お仕事を完了できませんでした。別の画像でもう一度お任せください。",
};

export function isVisionPipelineStage(value: unknown): value is VisionPipelineStage {
  return (
    typeof value === "string" &&
    (VISION_PIPELINE_STAGES as readonly string[]).includes(value)
  );
}

export function labelForVisionStage(stage: VisionPipelineStage): string {
  return VISION_STAGE_USER_LABEL[stage];
}

export function messageForVisionStage(stage: VisionPipelineStage): string {
  return VISION_STAGE_USER_MESSAGE[stage];
}

/**
 * Map VisionError codes → pipeline stage for user/developer discrimination.
 */
export function stageFromVisionErrorCode(
  code: string,
): VisionPipelineStage {
  switch (code) {
    case "upload_failed":
    case "too_large":
    case "corrupt_image":
    case "unsupported_type":
      return "upload";
    case "storage_failed":
    case "not_found":
    case "empty_image":
      return "storage_download";
    case "invalid_data_url":
      return "data_url";
    case "config_missing":
      return "vision_request";
    case "timeout":
    case "rate_limited":
    case "openai_failed":
    case "unreadable":
      return "vision_response";
    case "json_parse_failed":
    case "table_extract_failed":
      return "schema_validation";
    case "artifact_failed":
      return "artifact_generation";
    default:
      return "vision_response";
  }
}

/** Developer-facing one-liner (no PII). */
export function formatVisionDeveloperHint(input: {
  diagnosticId?: string | null;
  failedStage?: VisionPipelineStage | null;
  userCode?: string | null;
  errorCode?: string | null;
  openaiRequestId?: string | null;
  vercelRequestId?: string | null;
}): string {
  const parts = [
    input.diagnosticId ? `診断ID: ${input.diagnosticId}` : null,
    input.failedStage ? `工程: ${input.failedStage}` : null,
    input.userCode ? `userCode: ${input.userCode}` : null,
    input.errorCode ? `errorCode: ${input.errorCode}` : null,
    input.openaiRequestId ? `openai_request_id: ${input.openaiRequestId}` : null,
    input.vercelRequestId ? `vercel: ${input.vercelRequestId}` : null,
  ].filter(Boolean);
  return parts.join(" / ");
}
