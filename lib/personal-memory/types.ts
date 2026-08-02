/**
 * Unified Personal Memory model — not free-form chat history.
 */

export type Timestamp = string;
export type EntityId = string;

/** Memory kinds (A–H) — user-facing labels live in labels.ts */
export type PersonalMemoryKind =
  | "user_preference"
  | "work_preference"
  | "default_destination"
  | "automation_preference"
  | "naming_convention"
  | "template_preference"
  | "locale"
  | "sensitive";

export type PersonalMemoryScope =
  | "writing_style"
  | "document_design"
  | "color_palette"
  | "preferred_formats"
  | "file_naming"
  | "notification_preferences"
  | "approval_preferences"
  | "work_content_style"
  | "default_recipients"
  | "default_storage_locations"
  | "calendar_defaults"
  | "wordpress_defaults"
  | "automation_execution"
  | "date_format"
  | "title_format"
  | "sheet_naming"
  | "artifact_naming"
  | "word_template"
  | "excel_template"
  | "powerpoint_theme"
  | "pdf_layout"
  | "language"
  | "timezone"
  | "currency"
  | "contact_info"
  | "customer_info"
  | "recurring_work_preferences"
  /** Expanded personalization catalog */
  | "bullet_style"
  | "image_output"
  | "ocr_postprocess"
  | "company_template"
  | "client_style"
  | "ai_model_preference"
  | "preferred_work_hours";

export const PERSONAL_MEMORY_SCOPES: readonly PersonalMemoryScope[] = [
  "writing_style",
  "document_design",
  "color_palette",
  "preferred_formats",
  "file_naming",
  "notification_preferences",
  "approval_preferences",
  "work_content_style",
  "default_recipients",
  "default_storage_locations",
  "calendar_defaults",
  "wordpress_defaults",
  "automation_execution",
  "date_format",
  "title_format",
  "sheet_naming",
  "artifact_naming",
  "word_template",
  "excel_template",
  "powerpoint_theme",
  "pdf_layout",
  "language",
  "timezone",
  "currency",
  "contact_info",
  "customer_info",
  "recurring_work_preferences",
  "bullet_style",
  "image_output",
  "ocr_postprocess",
  "company_template",
  "client_style",
  "ai_model_preference",
  "preferred_work_hours",
] as const;

/** Confidence tiers for exclusivity experience */
export const MEMORY_CONFIDENCE_FORMAL = 0.9;
export const MEMORY_CONFIDENCE_CANDIDATE = 0.7;

export type MemorySource =
  | "explicit"
  | "approved_inference"
  | "correction"
  | "automation"
  | "imported"
  | "user_explicit"
  | "user_correction"
  | "automation_result"
  | "external_content"
  | "system_inference";

/** Sources that must never auto-activate */
export const INFERENCE_SOURCES: readonly MemorySource[] = [
  "approved_inference",
  "correction",
  "user_correction",
  "system_inference",
  "automation_result",
] as const;

/** Poisoning: never create candidates from these */
export const BLOCKED_CANDIDATE_SOURCES: readonly MemorySource[] = [
  "external_content",
] as const;

export type MemoryStatus =
  | "candidate"
  | "active"
  | "rejected"
  | "expired"
  | "deleted"
  | "paused";

export type MemorySensitivity = "normal" | "sensitive" | "restricted";

export type MemoryAppliesTo = {
  global: boolean;
  automationIds: string[];
  artifactTypes: string[];
  capabilities: string[];
};

export type MemoryEvidence = {
  kind: "user_message" | "correction" | "run" | "manual" | "import";
  summary: string;
  occurredAt: Timestamp;
  runId?: string | null;
  automationId?: string | null;
};

export type PersonalMemoryRecord = {
  id: EntityId;
  userId: string;
  kind: PersonalMemoryKind;
  scope: PersonalMemoryScope;
  key: string;
  /** Structured value — never secrets */
  value: Record<string, unknown>;
  /** Short user-facing label */
  title: string;
  /** Short explanation */
  summary: string;
  source: MemorySource;
  confidence: number;
  status: MemoryStatus;
  sensitivity: MemorySensitivity;
  appliesTo: MemoryAppliesTo;
  evidence: MemoryEvidence[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastUsedAt: Timestamp | null;
  expiresAt: Timestamp | null;
  /** Rejection reason when status=rejected */
  rejectedReason: string | null;
  /** Soft-delete timestamp */
  deletedAt: Timestamp | null;
};

export type MemoryRetentionPolicy =
  | "forever"
  | "days_30"
  | "days_90"
  | "days_365"
  | "until_automation_ends"
  | "once";

export type PersonalMemorySettings = {
  enabled: boolean;
  /** Only save explicit user statements */
  explicitOnly: boolean;
  /** Propose candidates from repeated corrections */
  proposeFromCorrections: boolean;
  /** Confirm per automation before use */
  confirmPerAutomation: boolean;
  /** Never persist sensitive scopes */
  blockSensitiveStorage: boolean;
  defaultRetention: MemoryRetentionPolicy;
  /** Days unused before reconfirmation candidate */
  unusedReconfirmDays: number;
  candidateNotifyBatchSize: number;
  candidateMinConfidence: number;
  maxMemoriesInjectedPerRun: number;
  maxInjectionChars: number;
};

export const DEFAULT_PERSONAL_MEMORY_SETTINGS: PersonalMemorySettings = {
  enabled: true,
  explicitOnly: false,
  proposeFromCorrections: true,
  confirmPerAutomation: false,
  blockSensitiveStorage: false,
  defaultRetention: "forever",
  unusedReconfirmDays: 90,
  candidateNotifyBatchSize: 3,
  candidateMinConfidence: MEMORY_CONFIDENCE_CANDIDATE,
  maxMemoriesInjectedPerRun: 8,
  maxInjectionChars: 1200,
};

export type CreatePersonalMemoryInput = {
  kind: PersonalMemoryKind;
  scope: PersonalMemoryScope;
  key: string;
  value: Record<string, unknown>;
  title: string;
  summary: string;
  source: MemorySource;
  confidence?: number;
  status?: MemoryStatus;
  sensitivity?: MemorySensitivity;
  appliesTo?: Partial<MemoryAppliesTo>;
  evidence?: MemoryEvidence[];
  expiresAt?: Timestamp | null;
  retention?: MemoryRetentionPolicy;
};

export type UpdatePersonalMemoryInput = Partial<
  Pick<
    PersonalMemoryRecord,
    | "title"
    | "summary"
    | "value"
    | "status"
    | "confidence"
    | "appliesTo"
    | "expiresAt"
    | "sensitivity"
    | "rejectedReason"
  >
>;

export type MemoryConflictKind =
  | "global_vs_automation"
  | "stale_vs_fresh"
  | "instruction_vs_memory"
  | "memory_vs_memory"
  | "destination"
  | "approval_policy"
  | "writing_style"
  | "template";

export type MemoryConflict = {
  id: string;
  kind: MemoryConflictKind;
  memoryIds: string[];
  message: string;
  highRisk: boolean;
  resolutionOptions: Array<
    | "prefer_current_instruction"
    | "prefer_automation"
    | "prefer_newer_memory"
    | "ask_user"
    | "disable_memory"
  >;
};

export type ResolvedMemoryValue = {
  memoryId: string;
  scope: PersonalMemoryScope;
  key: string;
  value: Record<string, unknown>;
  title: string;
  summary: string;
  source: MemorySource;
  layer:
    | "current_instruction"
    | "notes"
    | "automation_config"
    | "automation_override"
    | "global_memory"
    | "system_default";
  sensitivity: MemorySensitivity;
};

export type MemoryResolutionResult = {
  used: ResolvedMemoryValue[];
  unused: Array<{ memoryId: string; scope: PersonalMemoryScope; reason: string }>;
  conflicts: MemoryConflict[];
  overrides: ResolvedMemoryValue[];
  candidatesProposed: string[];
  injectionText: string;
  tokenEstimate: number;
  truncated: boolean;
};

/** Per-run memory ledger (Automation / orchestration) */
export type RunMemoryLedger = {
  memoryIdsUsed: string[];
  memoryValuesResolved: ResolvedMemoryValue[];
  memoryConflicts: MemoryConflict[];
  memoryOverrides: ResolvedMemoryValue[];
  memoryCandidateUpdates: string[];
  unusedMemoryIds: string[];
};

export type CorrectionSignal = {
  userId: string;
  text: string;
  before?: string | null;
  after?: string | null;
  automationId?: string | null;
  artifactType?: string | null;
  source: Exclude<MemorySource, "external_content">;
};

export const MAX_PERSONAL_MEMORIES_PER_USER = 300;
export const MAX_CANDIDATES_PER_USER = 50;
export const CORRECTION_REPEAT_THRESHOLD = 3;

export const SENSITIVE_SCOPES: readonly PersonalMemoryScope[] = [
  "default_recipients",
  "default_storage_locations",
  "contact_info",
  "customer_info",
  "calendar_defaults",
  "wordpress_defaults",
] as const;

export const RESTRICTED_VALUE_KEYS = [
  "password",
  "apiKey",
  "api_key",
  "accessToken",
  "refreshToken",
  "secret",
  "oauth",
  "authorization",
] as const;
