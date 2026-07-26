export type VisionDetailLevel = "low" | "auto" | "high";

export type VisionDetectedType =
  | "receipt"
  | "invoice"
  | "estimate"
  | "business_document"
  | "sales_material"
  | "table"
  | "spreadsheet_source"
  | "handwritten_note"
  | "business_card"
  | "whiteboard"
  | "screenshot"
  | "property_photo"
  | "equipment_photo"
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

export class VisionError extends Error {
  readonly code: VisionErrorCode;

  constructor(code: VisionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "VisionError";
  }
}

export type VisionGatePayload = {
  status: "vision_failed" | "needs_image_retry" | "needs_input" | "config_missing";
  analysisSuccess: boolean;
  message: string;
  userCode: string;
  diagnosticId?: string | null;
};

export const VISION_PROMPT_VERSION = "v1";
