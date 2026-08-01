export type VisionDetailLevel = "low" | "auto" | "high";

export type VisionDetectedType =
  | "receipt"
  | "receipt_voucher"
  | "invoice"
  | "delivery_note"
  | "estimate"
  | "contract"
  | "business_document"
  | "sales_material"
  | "table"
  | "spreadsheet_source"
  | "chart"
  | "handwritten_note"
  | "business_card"
  | "whiteboard"
  | "screenshot"
  | "meeting_minutes"
  | "property_photo"
  | "equipment_photo"
  | "construction_photo"
  | "identity_document"
  | "social_media_reference"
  | "design_reference"
  | "general_photo"
  | "unknown";

export type VisionJobStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "analyzed"
  | "needs_input"
  | "artifact_generating"
  | "completed"
  | "failed";

export type VisionTable = {
  headers: string[];
  rows: Array<Array<string | number | null>>;
  notes?: string | null;
};

export type VisionFieldMap = Record<string, unknown>;

export type VisionLayout = {
  hierarchy?: string | null;
  sections?: string[] | null;
  readability?: string | null;
  colorTendency?: string | null;
  logoPosition?: string | null;
  ctaPlacement?: string | null;
  /** Production layout structure (kept for deliverable seeding). */
  title?: string | null;
  headings?: string[] | null;
  paragraphs?: string[] | null;
  bulletLists?: string[] | null;
  hasTable?: boolean | null;
  hasImage?: boolean | null;
  header?: string | null;
  footer?: string | null;
  pageNumbers?: string[] | null;
  signature?: string | null;
  seal?: string | null;
  cells?: Array<{ row: number; col: number; text: string }> | null;
};

export type VisionStyleSignals = {
  tone?: string | null;
  politeness?: string | null;
  sentenceLength?: string | null;
  headingStyle?: string | null;
  frequentPhrases?: string[] | null;
  ctaStyle?: string | null;
  structure?: string | null;
  designTendency?: string | null;
  forbiddenCandidates?: string[] | null;
};

export type VisionAnalysisResult = {
  id: string;
  attachmentId: string;
  detectedType: VisionDetectedType;
  confidence: number;
  summary: string;
  extractedText: string | null;
  language: string | null;
  fields: VisionFieldMap;
  tables: VisionTable[];
  visualElements: string[];
  layout: VisionLayout | null;
  styleSignals: VisionStyleSignals | null;
  warnings: string[];
  missingFields: string[];
  recommendedActions: string[];
  artifactSuggestions: string[];
  model: string;
  detailLevel: VisionDetailLevel;
  createdAt: string;
  cached?: boolean;
  pageIndex?: number;
};

export type VisionBatchResult = {
  id: string;
  images: VisionAnalysisResult[];
  combinedSummary: string;
  commonFields: VisionFieldMap;
  differences: string[];
  mergedTables: VisionTable[];
  warnings: string[];
  recommendedArtifactType: string | null;
  status: VisionJobStatus;
  model: string;
  detailLevel: VisionDetailLevel;
  createdAt: string;
  cost?: VisionCostRecord;
  needsInput?: {
    message: string;
    fields: string[];
  };
};

export type VisionCostRecord = {
  userId: string;
  jobId: string | null;
  imageCount: number;
  originalBytes: number;
  processedBytes: number;
  detailLevel: VisionDetailLevel;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  success: boolean;
  cached: boolean;
  createdAt: string;
};

export type VisionErrorCode =
  | "upload_failed"
  | "storage_failed"
  | "unsupported_type"
  | "too_large"
  | "corrupt_image"
  | "openai_failed"
  | "timeout"
  | "rate_limited"
  | "unreadable"
  | "json_parse_failed"
  | "table_extract_failed"
  | "artifact_failed"
  | "forbidden"
  | "not_found"
  | "config_missing"
  | "empty_image"
  | "invalid_data_url";

export type VisionErrorDetails = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export class VisionError extends Error {
  readonly code: VisionErrorCode;
  readonly diagnosticId: string | null;
  readonly failedStage: string | null;
  /** Safe diagnostic fields (OpenAI status/code/requestId, etc.). Never secrets. */
  readonly details: VisionErrorDetails | null;

  constructor(
    code: VisionErrorCode,
    message: string,
    options?: {
      diagnosticId?: string | null;
      failedStage?: string | null;
      details?: VisionErrorDetails | null;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.code = code;
    this.name = "VisionError";
    this.diagnosticId = options?.diagnosticId ?? null;
    this.failedStage = options?.failedStage ?? null;
    this.details = options?.details ?? null;
  }
}

/** Re-throw preserving diagnostic details (never drop OpenAI fields). */
export function rethrowVisionError(
  error: VisionError,
  overrides?: {
    diagnosticId?: string | null;
    failedStage?: string | null;
    message?: string;
  },
): never {
  throw new VisionError(error.code, overrides?.message ?? error.message, {
    diagnosticId: overrides?.diagnosticId ?? error.diagnosticId,
    failedStage: overrides?.failedStage ?? error.failedStage,
    details: error.details,
    cause: error.cause ?? error,
  });
}

export type VisionOpenAiFailureInfo = {
  httpStatus: number | null;
  type: string | null;
  code: string | null;
  message: string | null;
  requestId: string | null;
  rawErrorBody: string | null;
};

export type VisionGatePayload = {
  status: "vision_failed" | "needs_image_retry" | "needs_input" | "config_missing";
  analysisSuccess: boolean;
  /** User-facing Japanese message (includes which stage failed). */
  message: string;
  userCode: string;
  diagnosticId?: string | null;
  /** Pipeline stage that failed (upload / AI / artifact / …). */
  failedStage?: string | null;
  /** Short Japanese stage label for UI badges. */
  failedStageLabel?: string | null;
  /** Developer error code (VisionError.code or internal). */
  developerCode?: string | null;
  /** Root cause summary for UI (not a generic retry string). */
  cause?: string | null;
  /** OpenAI error fields for AI解析失敗画面. */
  openai?: VisionOpenAiFailureInfo | null;
  /** Vercel request id for log correlation. */
  vercelRequestId?: string | null;
};

export const VISION_PROMPT_VERSION = "v3-production-document-ready";
