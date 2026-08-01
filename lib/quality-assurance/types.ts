/** Evidence-based quality assurance types — rates are measured or explicitly unmeasured. */

export type MeasuredRate = {
  /** null = unmeasured (must fail Release Ready gate). */
  rate: number | null;
  success: number;
  failure: number;
  total: number;
  measured: boolean;
  source: string;
};

/** Alias used by gate helpers. */
export type QualityRate = MeasuredRate;

export type LatencyStats = {
  avgMs: number | null;
  p95Ms: number | null;
  sampleCount: number;
  measured: boolean;
  source: string;
};

export type EvidenceCaseCategory =
  | "word"
  | "excel"
  | "pdf"
  | "pptx"
  | "csv"
  | "vision"
  | "ocr"
  | "convert"
  | "list"
  | "preview"
  | "download"
  | "revision"
  | "notification"
  | "job"
  | "integration";

export type EvidenceCaseResult = {
  id: string;
  category: EvidenceCaseCategory;
  name: string;
  ok: boolean;
  durationMs: number;
  requestId: string;
  log: string[];
  error?: string | null;
  artifactPath?: string | null;
  screenshotPath?: string | null;
  environment: "local" | "staging" | "production";
  at: string;
};

export type EvidenceSuiteSummary = {
  suiteId: string;
  totalCases: number;
  passed: number;
  failed: number;
  environment: "local" | "staging" | "production";
  startedAt: string;
  finishedAt: string;
  cases: EvidenceCaseResult[];
  reportPath?: string | null;
};

export type QualityGateThresholds = {
  wordSuccessRate: number;
  excelSuccessRate: number;
  pdfSuccessRate: number;
  powerpointSuccessRate: number;
  visionSuccessRate: number;
  notificationSuccessRate: number;
  storageSuccessRate: number;
  jobSuccessRate: number;
};

export type CriticalCategory =
  | "data_loss"
  | "corrupt_artifact"
  | "authz_leak"
  | "storage_leak"
  | "auth_leak"
  | "billing_mismatch"
  | "vision_timeout_unmitigated"
  | "stuck_job"
  | "notification_miss"
  | "other";

export type CriticalFinding = {
  id: string;
  category: CriticalCategory;
  severity: "Critical";
  title: string;
  detail: string;
  evidenceRefs: string[];
  blocksRelease: boolean;
  detectedAt: string;
};

export type GateCheckResult = {
  id: string;
  label: string;
  pass: boolean;
  reason: string;
};

export type QualityGatesEvaluation = {
  releaseReady: boolean;
  thresholdsMet: boolean;
  hasCriticalFindings: boolean;
  productionE2eVerified: boolean;
  evidenceSuitePassed: boolean;
  checks: GateCheckResult[];
  reasons: string[];
};

export type QualityMetricRow = {
  id: string;
  label: string;
  value: QualityRate;
  latency?: LatencyStats | null;
  note?: string | null;
};

export type QualityMetricSection = {
  id: string;
  title: string;
  metrics: QualityMetricRow[];
};

export type QualityDashboardSnapshot = {
  generatedAt: string;
  windowDays: 7 | 30 | 90;
  /** Flat sections for Owner UI tables. */
  sections: QualityMetricSection[];
  ai: {
    intentSuccess: MeasuredRate;
    formatSuccess: MeasuredRate;
    visionSuccess: MeasuredRate;
    ocrSuccess: MeasuredRate;
    avgConfidence: number | null;
    fallbackRate: MeasuredRate;
    misclassificationRate: MeasuredRate;
  };
  deliverables: {
    word: MeasuredRate;
    excel: MeasuredRate;
    pdf: MeasuredRate;
    powerpoint: MeasuredRate;
    csv: MeasuredRate;
    avgGenerateMs: LatencyStats;
    failureRate: MeasuredRate;
    retryRate: MeasuredRate;
    corruptRate: MeasuredRate;
  };
  vision: {
    openaiTimeoutRate: MeasuredRate;
    ocrSuccess: MeasuredRate;
    analyzeSuccess: MeasuredRate;
    avgMs: LatencyStats;
    p95Ms: number | null;
    avgImageBytes: number | null;
    avgPageCount: number | null;
    abortRate: MeasuredRate;
  };
  jobs: {
    completedRate: MeasuredRate;
    failedRate: MeasuredRate;
    retryRate: MeasuredRate;
    needsInputRate: MeasuredRate;
    avgDurationMs: LatencyStats;
    avgWaitMs: LatencyStats;
    queueDepth: number | null;
  };
  notifications: {
    successRate: MeasuredRate;
    pushSuccessRate: MeasuredRate;
    emailSuccessRate: MeasuredRate;
    delayMs: LatencyStats;
  };
  storage: {
    uploadSuccess: MeasuredRate;
    downloadSuccess: MeasuredRate;
    signedUrlSuccess: MeasuredRate;
    zeroByteRate: MeasuredRate;
  };
  system: {
    cpu: number | null;
    memoryMb: number | null;
    coldStartMs: number | null;
    apiLatencyMs: LatencyStats;
    errorRate: MeasuredRate;
  };
  evidence: EvidenceSuiteSummary | null;
  criticalFindings: CriticalFinding[];
  gates: QualityGatesEvaluation;
  /** Convenience: gates.releaseReady */
  releaseReady: boolean;
  productionE2eVerified: boolean;
  beforeAfter: {
    note: string;
    previousSelfScores: Record<string, number>;
    measuredRates: Record<string, number | null>;
  };
};
