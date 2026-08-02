/**
 * Production Personalization types — Memory that changes real artifacts.
 * Estimated metrics must never be labeled as measured.
 */

export type Timestamp = string;
export type EntityId = string;

export const MEMORY_SCOPE_TYPES = [
  "global",
  "company",
  "workCategory",
  "artifactType",
  "automation",
  "template",
] as const;

export type MemoryScopeType = (typeof MEMORY_SCOPE_TYPES)[number];

/** Priority rank: lower number = higher priority. Explicit is handled separately. */
export const SCOPE_PRIORITY_RANK: Record<MemoryScopeType, number> = {
  automation: 2,
  template: 3,
  company: 4,
  workCategory: 5,
  artifactType: 6,
  global: 7,
};

export const MEMORY_CANDIDATE_STATUSES = [
  "candidate",
  "active",
  "rejected",
  "disabled",
  "deleted",
] as const;

export type MemoryCandidateStatus =
  (typeof MEMORY_CANDIDATE_STATUSES)[number];

export const MEMORY_SOURCES = [
  "explicit",
  "user_correction",
  "approved_inference",
  "automation",
  "imported",
  "system",
] as const;

export type ProductionMemorySource = (typeof MEMORY_SOURCES)[number];

export type ProductionMemoryRecord = {
  memoryId: EntityId;
  ownerId: string;
  scopeType: MemoryScopeType;
  scopeId: string | null;
  category: string | null;
  artifactType: string | null;
  key: string;
  normalizedValue: Record<string, unknown>;
  source: ProductionMemorySource;
  candidateStatus: MemoryCandidateStatus;
  confidence: number;
  evidenceCount: number;
  acceptedCount: number;
  rejectedCount: number;
  appliedCount: number;
  successfulApplicationCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  disabledAt: Timestamp | null;
  deletedAt: Timestamp | null;
  version: number;
  lastAppliedAt: Timestamp | null;
  lastEvaluatedAt: Timestamp | null;
  /** Short user-facing label — never raw document body */
  title: string;
  summary: string;
  /** High-impact memories require explicit approval before activation */
  highImpact: boolean;
  approvedAt: Timestamp | null;
};

export type WritingStylePrefs = {
  tone?: "formal" | "polite" | "casual" | "neutral";
  politeness?: "high" | "medium" | "low";
  verbosity?: "short" | "medium" | "long";
  sentenceLength?: "short" | "medium" | "long";
  bulletUsage?: "prefer" | "balanced" | "avoid";
  headingDensity?: "high" | "medium" | "low";
  terminology?: Record<string, string>;
};

export type StructurePrefs = {
  headingStyle?: "numbered" | "plain" | "question";
  sectionOrder?: string[];
  maxSections?: number;
  pageLayout?: "compact" | "standard" | "spacious";
};

export type VisualStylePrefs = {
  colorPalette?: "blue" | "red" | "green" | "mono" | "brand";
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  marginsMm?: number;
  aspectRatio?: "16:9" | "4:3";
  freezePane?: boolean;
  autoFilter?: boolean;
  headerFooter?: boolean;
};

export type ArtifactPreferences = {
  preferredFormats?: string[];
  columnOrder?: string[];
  dateFormat?: string;
  currencyFormat?: string;
  chartEnabled?: boolean;
  maxSlides?: number;
  ocrNormalize?: {
    columns?: string[];
    dateFormat?: string;
    amountFormat?: string;
    summaryStyle?: "bullets" | "paragraph";
  };
};

export type DeliveryPreferences = {
  fileNamePattern?: string;
  saveDestination?: string;
  alsoGeneratePdf?: boolean;
  notificationPreference?: "silent" | "normal" | "verbose";
};

export type ApprovalPreferences = {
  requireApproval?: boolean;
  skipApproval?: boolean;
  autoSendExternal?: boolean;
};

export type PersonalizationConflict = {
  key: string;
  memoryIds: string[];
  message: string;
  resolution: "higher_priority" | "confidence_recency" | "ask_user" | "blocked";
  winningMemoryId?: string;
};

export type PersonalizationContext = {
  writingStyle: WritingStylePrefs;
  structure: StructurePrefs;
  visualStyle: VisualStylePrefs;
  artifactPreferences: ArtifactPreferences;
  deliveryPreferences: DeliveryPreferences;
  approvalPreferences: ApprovalPreferences;
  appliedMemoryIds: string[];
  ignoredMemoryIds: string[];
  conflicts: PersonalizationConflict[];
  explicitOverrides: Record<string, unknown>;
  /** User-facing preview lines (no confidence numbers) */
  previewLines: string[];
  /** True when unresolved conflict requires user confirmation */
  requiresConfirmation: boolean;
};

export type DiffCategory =
  | "tone"
  | "politeness"
  | "verbosity"
  | "sentenceLength"
  | "headingStructure"
  | "bulletUsage"
  | "terminology"
  | "ordering"
  | "formatting"
  | "color"
  | "layout"
  | "fileFormat"
  | "saveDestination"
  | "naming"
  | "approval"
  | "notification";

export type StructuralDiffMetric = {
  category: DiffCategory;
  beforeValue: string;
  afterValue: string;
  magnitude: number;
};

export type DiffMetrics = {
  normalizedDiffRate: number;
  categories: StructuralDiffMetric[];
  instructionLength: number;
  revisionCount: number;
};

export type GenerationApplicationRecord = {
  generationId: EntityId;
  ownerId: string;
  artifactId: string | null;
  category: string | null;
  artifactType: string | null;
  appliedMemoryIds: string[];
  ignoredMemoryIds: string[];
  explicitOverrides: Record<string, unknown>;
  conflictResolutions: PersonalizationConflict[];
  predictedPreferenceIds: string[];
  preGenerationScore: number | null;
  postRevisionScore: number | null;
  diffMetrics: DiffMetrics | null;
  firstAccept: boolean | null;
  userRating: number | null;
  revisionCount: number;
  revisionDurationMs: number | null;
  memoryEnabled: boolean;
  createdAt: Timestamp;
  /** measured | estimated — never conflate */
  scoreKind: "measured" | "estimated";
};

export type QualityMetrics = {
  memoryApplicationRate: number;
  memoryAcceptanceRate: number;
  memoryRejectionRate: number;
  firstAcceptRate: number;
  revisionRate: number;
  normalizedDiffRate: number;
  instructionReductionRate: number;
  reuseRate: number;
  preferenceMatchRate: number;
  conflictRate: number;
  overrideRate: number;
  falseApplicationRate: number;
  kind: "measured";
  sampleSize: number;
};

export const PREDICTION_TYPES = [
  "deterministic_rule",
  "heuristic",
  "statistical_prediction",
  "llm_inference",
] as const;

export type PredictionType = (typeof PREDICTION_TYPES)[number];

export type PredictionRecord = {
  predictionId: EntityId;
  ownerId: string;
  sourceSignals: string[];
  predictionType: PredictionType;
  /** User-facing: always「過去の利用から提案」style — never「AI予測」alone for rules */
  userFacingLabel: string;
  confidence: number;
  applied: boolean;
  accepted: boolean | null;
  rejected: boolean | null;
  corrected: boolean | null;
  outcome: string | null;
  createdAt: Timestamp;
};

export const HIGH_IMPACT_KEYS = [
  "externalSend",
  "saveDestination",
  "publish",
  "recipients",
  "autoExecute",
  "skipApproval",
  "billingImpact",
  "dataDelete",
] as const;

export type HighImpactKey = (typeof HIGH_IMPACT_KEYS)[number];

export const AUTO_APPLY_SAFE_KEYS = [
  "tone",
  "verbosity",
  "bulletUsage",
  "headingDensity",
  "colorPalette",
  "primaryColor",
  "aspectRatio",
  "fileNamePattern",
  "marginsMm",
  "freezePane",
  "autoFilter",
  "fontFamily",
] as const;

export type ArtifactGeneratorOptions = {
  personalization?: PersonalizationContext;
  word?: {
    fontFamily?: string;
    marginsMm?: number;
    footerNote?: string;
    verbosity?: WritingStylePrefs["verbosity"];
    bulletPrefer?: boolean;
    headingDensity?: WritingStylePrefs["headingDensity"];
  };
  excel?: {
    freezePane?: boolean;
    autoFilter?: boolean;
    headerColor?: string;
    columnOrder?: string[];
    dateFormat?: string;
    currencyFormat?: string;
    chartEnabled?: boolean;
  };
  pdf?: {
    marginsMm?: number;
    fontFamily?: string;
    headerFooter?: boolean;
    pageLayout?: StructurePrefs["pageLayout"];
  };
  powerpoint?: {
    aspectRatio?: "16:9" | "4:3";
    primaryColor?: string;
    maxSlides?: number;
    bulletPrefer?: boolean;
    headingDensity?: WritingStylePrefs["headingDensity"];
  };
  ocr?: ArtifactPreferences["ocrNormalize"];
  fileNamePattern?: string;
};

export type LearningLoopIteration = {
  iteration: number;
  category: string;
  artifactType: string;
  instructionLength: number;
  appliedMemoryCount: number;
  diffRate: number;
  firstAccept: boolean;
  revisionCount: number;
  score: number;
  falseApplication: boolean;
  explicitInstructionViolations: number;
};

export type LearningLoopResult = {
  category: string;
  artifactType: string;
  iterations: LearningLoopIteration[];
  instructionReductionRate: number;
  diffReductionRate: number;
  falseApplicationRate: number;
  explicitInstructionViolations: number;
  firstAcceptRateLast3: number;
};
