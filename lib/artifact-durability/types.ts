export type ArtifactFormatUnderTest = "docx" | "xlsx" | "pdf" | "pptx";

export type ArtifactFailureClass =
  | "generation_failed"
  | "invalid_file_structure"
  | "output_validation_failed"
  | "storage_upload_failed"
  | "artifact_save_failed"
  | "preview_failed"
  | "download_failed"
  | "revision_failed"
  | "conversion_failed"
  | "font_failed"
  | "image_reference_failed"
  | "formula_validation_failed"
  | "layout_overflow"
  | "file_too_large"
  | "timeout"
  | "duplicate_request"
  | "permission_denied"
  | "env_missing"
  | "unknown";

export type ArtifactEvalCase = {
  caseId: string;
  format: ArtifactFormatUnderTest;
  category: string;
  title: string;
  assignment: string;
  /** Unique source markdown/content for generation — never reused across cases. */
  content: string;
  expectedSheetsOrSlides?: number;
  notes: string;
  tags?: string[];
};

export type StructureCheck = {
  name: string;
  ok: boolean;
  detail?: string;
};

export type ArtifactCaseResult = {
  caseId: string;
  format: ArtifactFormatUnderTest;
  category: string;
  okGenerate: boolean;
  okStructure: boolean;
  okStorage: boolean;
  okDb: boolean;
  okPreview: boolean;
  okDownload: boolean;
  okRevision: boolean;
  /** True when this case attempted revision (subset of cases). */
  revisionAttempted: boolean;
  /** Final usable success: generate+structure+storage+db+preview+download openable */
  okFinal: boolean;
  requestId: string;
  jobId: string | null;
  artifactId: string | null;
  diagnosticId: string | null;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  generateMs: number | null;
  saveMs: number | null;
  previewMs: number | null;
  downloadOk: boolean;
  revisionOk: boolean;
  retryCount: number;
  finalStatus: string;
  failedStage: string | null;
  userCode: string | null;
  developerCode: string | null;
  fileSize: number | null;
  sha256: string | null;
  structureChecks: StructureCheck[];
  failureClass: ArtifactFailureClass | null;
  failureReason: string | null;
  environment: "local" | "production-http";
  log: string[];
  screenshotPath: string | null;
  evidencePath: string | null;
};

export type ConversionCaseResult = {
  caseId: string;
  sourceFormat: string;
  targetFormat: string;
  ok: boolean;
  requestId: string;
  sourceArtifactId: string | null;
  targetArtifactId: string | null;
  rootArtifactId: string | null;
  overwrittenSource: boolean;
  zeroByte: boolean;
  mimeOk: boolean;
  openable: boolean;
  durationMs: number;
  failureClass: ArtifactFailureClass | null;
  failureReason: string | null;
  log: string[];
};

export type FormatAggregate = {
  format: ArtifactFormatUnderTest;
  total: number;
  generateSuccess: number;
  structureSuccess: number;
  storageSuccess: number;
  previewSuccess: number;
  downloadSuccess: number;
  revisionSuccess: number;
  finalSuccess: number;
  corruptCount: number;
  zeroByteCount: number;
  generateRate: number | null;
  structureRate: number | null;
  storageRate: number | null;
  previewRate: number | null;
  downloadRate: number | null;
  revisionRate: number | null;
  finalRate: number | null;
  corruptRate: number | null;
  avgMs: number | null;
  medianMs: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  avgFileBytes: number | null;
  productionCount: number;
};

export type ArtifactDurabilityAggregate = {
  totalCases: number;
  byFormat: Record<ArtifactFormatUnderTest, FormatAggregate>;
  conversion: {
    total: number;
    success: number;
    rate: number | null;
    byPair: Record<string, { total: number; success: number; rate: number | null }>;
  };
  failureRanking: Array<{ class: ArtifactFailureClass; count: number }>;
  mimeMismatchCount: number;
  extensionSpoofCount: number;
  crossUserAccessCount: number;
  revisionSourceLostCount: number;
  duplicateRate: number | null;
  targets: Record<string, number>;
  targetAssessment: Record<
    string,
    { pass: boolean; actual: number | null; note: string }
  >;
  phase2Pass: boolean;
  phase2FailReasons: string[];
};
