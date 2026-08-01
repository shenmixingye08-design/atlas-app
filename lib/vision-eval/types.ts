import type { VisionDetectedType } from "@/lib/vision/types";

export type VisionEvalCategory =
  | "receipt"
  | "invoice"
  | "ryoshusho"
  | "table_form"
  | "business_card"
  | "handwritten_note"
  | "screenshot"
  | "chart"
  | "dark"
  | "tilted"
  | "blurred";

export type VisionEvalDifficulty = "easy" | "medium" | "hard";

export type VisionFailureClass =
  | "upload_failed"
  | "storage_read_failed"
  | "invalid_image"
  | "image_too_large"
  | "preprocessing_failed"
  | "openai_timeout"
  | "openai_rate_limit"
  | "openai_network"
  | "openai_4xx"
  | "openai_5xx"
  | "schema_validation_failed"
  | "ocr_failed"
  | "low_confidence"
  | "required_fields_missing"
  | "job_state_mismatch"
  | "artifact_generation_failed"
  | "timeout_needs_input_misclassified"
  | "env_missing"
  | "unknown";

export type VisionEvalCase = {
  caseId: string;
  category: VisionEvalCategory;
  /** Relative path under evidence dir after generation. */
  imagePath: string;
  expectedDocumentType: VisionDetectedType;
  expectedFields: Record<string, string>;
  /** Strings that must appear in extractedText / fields for OCR scoring. */
  expectedReadable: string[];
  difficulty: VisionEvalDifficulty;
  notes: string;
  /** Synthetic fixture seed — unique per case, never real PII. */
  seed: {
    title: string;
    lines: string[];
    amount?: string;
    date?: string;
    company?: string;
  };
};

export type VisionCaseRunResult = {
  caseId: string;
  category: VisionEvalCategory;
  ok: boolean;
  ocrOk: boolean;
  requestId: string;
  jobId: string | null;
  diagnosticId: string | null;
  openAiRequestId: string | null;
  httpStatus: number | null;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  visionMs: number | null;
  retryCount: number;
  finalStatus: string;
  failedStage: string | null;
  developerCode: string | null;
  userCode: string | null;
  timedOut: boolean;
  analysis: {
    detectedType: string | null;
    confidence: number | null;
    extractedTextPreview: string | null;
    fieldKeys: string[];
    tableCount: number;
  } | null;
  artifactGenerated: boolean;
  artifactFormats: string[];
  failureClass: VisionFailureClass | null;
  failureReason: string | null;
  score: {
    fieldHitRate: number;
    readableHitRate: number;
    typeOk: boolean;
    schemaOk: boolean;
  };
  environment: "local-live" | "production-http" | "fault-inject";
  log: string[];
  screenshotPath: string | null;
  evidencePath: string | null;
};

export type OcrMetrics = {
  charExtractSuccessRate: number | null;
  exactMatchRate: number | null;
  charErrorRate: number | null;
  digitRecognitionRate: number | null;
  dateRecognitionRate: number | null;
  amountRecognitionRate: number | null;
  japaneseRecognitionRate: number | null;
  alnumRecognitionRate: number | null;
  tableStructureRate: number | null;
  confidenceCorrelation: number | null;
  sampleSize: number;
  note: string;
};

export type VisionEvalAggregate = {
  totalCases: number;
  successCount: number;
  failureCount: number;
  visionSuccessRate: number | null;
  ocrSuccessRate: number | null;
  categoryRates: Record<string, { success: number; total: number; rate: number | null }>;
  avgMs: number | null;
  medianMs: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  timeoutRate: number | null;
  retryRate: number | null;
  retrySuccessRate: number | null;
  needsInputRate: number | null;
  schemaFailureRate: number | null;
  artifactGenerationRate: number | null;
  corruptArtifactRate: number | null;
  failureRanking: Array<{ class: VisionFailureClass; count: number }>;
  ocr: OcrMetrics;
  targets: {
    visionSuccessRate: number;
    timeoutRate: number;
    retrySuccessRate: number;
    timeoutNeedsInputMisclassify: number;
    artifactGenerationRate: number;
    amountDateDigitRecognition: number;
  };
  targetAssessment: Record<string, { pass: boolean; actual: number | null; note: string }>;
  phase1Pass: boolean;
  phase1FailReasons: string[];
};
