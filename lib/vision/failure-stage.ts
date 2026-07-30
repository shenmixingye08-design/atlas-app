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
  upload: "画像アップロード",
  preprocess: "画像の前処理",
  storage_save: "画像の保存",
  storage_download: "保存画像の読み込み",
  data_url: "AI送信用データの準備",
  vision_request: "AIへの送信",
  vision_response: "AI解析",
  schema_validation: "解析結果の整理",
  artifact_generation: "成果物の作成",
  deliverable_save: "成果物の保存",
  artifact_handoff: "成果物への引き渡し",
  blocked: "処理の停止",
};

/** User-facing explanation — clear, not technical jargon. */
export const VISION_STAGE_USER_MESSAGE: Record<VisionPipelineStage, string> = {
  upload: "画像を受け取れませんでした。もう一度選び直してください。",
  preprocess:
    "画像を解析用に整えられませんでした。JPEGまたはPNGで送り直してください。",
  storage_save: "画像の保存に失敗しました。もう一度アップロードしてください。",
  storage_download:
    "保存済みの画像を読み込めませんでした。もう一度アップロードしてください。",
  data_url:
    "AIに渡す画像データを準備できませんでした。別の画像でお試しください。",
  vision_request:
    "AI解析を開始できませんでした。少し時間をおいて再試行してください。",
  vision_response:
    "AIから解析結果を受け取れませんでした。再試行してください。",
  schema_validation:
    "AIの解析結果を整理できませんでした。再解析してください。",
  artifact_generation:
    "画像の内容は読み取れましたが、成果物を作成できませんでした。",
  deliverable_save: "成果物の保存に失敗しました。再試行してください。",
  artifact_handoff:
    "解析結果から成果物への引き渡しに失敗しました。再試行してください。",
  blocked: "画像解析を完了できなかったため、成果物作成を停止しました。",
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
}): string {
  const parts = [
    input.diagnosticId ? `診断ID: ${input.diagnosticId}` : null,
    input.failedStage ? `工程: ${input.failedStage}` : null,
    input.userCode ? `userCode: ${input.userCode}` : null,
    input.errorCode ? `errorCode: ${input.errorCode}` : null,
  ].filter(Boolean);
  return parts.join(" / ");
}
