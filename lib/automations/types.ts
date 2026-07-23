/** ISO 8601 timestamp. */
export type Timestamp = string;

/** Opaque UUID primary key. */
export type EntityId = string;

/**
 * Lifecycle status of an automation definition.
 * `idle` = 待機中, `running` = 実行中, `retrying` = リトライ中,
 * `success` = 完了, `failed` = 失敗.
 */
export type AutomationStatus =
  | "idle"
  | "running"
  | "retrying"
  | "success"
  | "failed";

/** Trigger kinds — schedule is active; others reserved for future integrations. */
export type AutomationTriggerKind =
  | "schedule"
  | "webhook"
  | "email"
  | "calendar";

export type SchedulePreset =
  | { type: "daily"; hour: number; minute: number }
  | { type: "weekly"; dayOfWeek: number; hour: number; minute: number }
  | { type: "monthly"; dayOfMonth: number; hour: number; minute: number }
  | { type: "once"; at: Timestamp };

/** Schedule configuration — cron string stored for future external schedulers. */
export type AutomationSchedule =
  | {
      kind: "schedule";
      preset: SchedulePreset;
      /** Future cron expression (e.g. `0 8 * * *`). */
      cron?: string;
      timezone: string;
      label: string;
    }
  | {
      kind: Exclude<AutomationTriggerKind, "schedule">;
      label: string;
      /** Placeholder config for webhook / email / calendar triggers. */
      config?: Record<string, unknown>;
    };

/** Work assignment passed into the orchestration pipeline. */
export type AutomationWorkflow = {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
};

/** When the automation stops running. */
export type AutomationEndCondition =
  | { type: "never" }
  | { type: "until_date"; until: Timestamp }
  | {
      type: "occurrence_count";
      maxOccurrences: number;
      completedOccurrences: number;
    };

/** Start date and end rules for recurring work. */
export type AutomationTiming = {
  startDate: Timestamp | null;
  endCondition: AutomationEndCondition;
};

/**
 * How far the user asks the AI employee to go on each automation run.
 * Stored per habit — does not change Planner/Deliverable/API pipelines.
 */
export type AutomationExecutionLevel =
  | "suggest_only"
  | "draft_save"
  | "approve_then_run"
  | "full_auto";

/**
 * Cost optimization mode — controls batching, cache reuse, and AI call frequency.
 * Stored per habit — does not change Planner/Deliverable/Workflow cores.
 */
export type AutomationExecutionMode = "eco" | "standard" | "high_quality";

/** SNS batch window for eco-mode combined generation. */
export type SnsBatchDays = 7 | 30;

/** External service kinds — extend when connectors are added. */
export type WorkflowIntegrationKind =
  | "atlas"
  | "manual"
  | "google_drive"
  | "dropbox"
  | "wordpress"
  | "sns"
  | "youtube"
  | "email";

export type WorkflowTemplateId =
  | "sns_post"
  | "blog"
  | "sales_material"
  | "video"
  | "generic";

/** Static step definition inside a workflow template. */
export type WorkflowStepDefinition = {
  id: string;
  label: string;
  integration: WorkflowIntegrationKind;
  /** Future: connector instance id when multiple providers exist. */
  connectorId?: string;
};

/** Per-job step ON/OFF state. */
export type WorkflowStepState = {
  id: string;
  enabled: boolean;
};

/**
 * Configurable execution flow — which steps ATLAS handles per job.
 * Separate from AutomationWorkflow (assignment text).
 */
export type WorkExecutionFlow = {
  templateId: WorkflowTemplateId;
  steps: WorkflowStepState[];
};

/** Recurring AI work definition. */
export type Automation = {
  id: EntityId;
  /** Owner — required for durable per-user persistence. */
  userId: string | null;
  name: string;
  description: string;
  schedule: AutomationSchedule;
  workflow: AutomationWorkflow;
  timing: AutomationTiming;
  executionLevel: AutomationExecutionLevel;
  executionMode: AutomationExecutionMode;
  snsBatchDays: SnsBatchDays | null;
  executionFlow: WorkExecutionFlow;
  enabled: boolean;
  lastRun: Timestamp | null;
  nextRun: Timestamp | null;
  /** When status is retrying, cron picks the job up at this time. */
  nextRetryAt: Timestamp | null;
  /**
   * The due slot currently being executed / retried (ISO). Used for
   * idempotent claims so nextRun can stay until the run finishes.
   */
  activeSlotKey: string | null;
  status: AutomationStatus;
  lastWorkflowRunId: EntityId | null;
  lastError: string | null;
  /** Short human-readable last outcome for list UX. */
  lastResultSummary: string | null;
  /** Current attempt while running/retrying (1–4 = initial + 3 retries). */
  currentAttempt: number;
  successCount: number;
  failureCount: number;
  /** Compact recent run ledger (durable). */
  runHistory: AutomationRunHistoryEntry[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/** Artifacts produced by one automation run (durable, compact). */
export type AutomationRunArtifacts = {
  tweetUrl?: string | null;
  tweetId?: string | null;
  deliverableCount?: number;
  preview?: string | null;
};

/** Compact durable run history row (not full orchestration payload). */
export type AutomationRunHistoryEntry = {
  id: EntityId;
  status: "completed" | "failed" | "retrying";
  startedAt: Timestamp;
  completedAt: Timestamp;
  /** Wall-clock duration for this attempt or final run. */
  durationMs: number;
  error: string | null;
  triggerType: "manual" | "automation" | string;
  /** 1-based attempt number (max 4 = initial + 3 deferred retries). */
  attempt: number;
  deliverablePreview: string | null;
  /** AI-generated content preview (tweet copy, article body, etc.). */
  generatedContent: string | null;
  artifacts: AutomationRunArtifacts | null;
  /** What the AI/system did (e.g. 文章生成, X投稿). */
  actions: string[];
  /** APIs used this run (openai, x_api, ...). */
  apisUsed: string[];
  /** Last pipeline stage reached (for admin debug). */
  stoppedAtStage: AutomationDebugStage | null;
};

/** Pipeline stages for owner debug — where a run started / stopped. */
export type AutomationDebugStage =
  | "queued"
  | "started"
  | "ai_started"
  | "ai_completed"
  | "ai_cached"
  | "deliverables"
  | "x_api"
  | "persisted"
  | "completed"
  | "failed"
  | "retry_scheduled";

export type CreateAutomationInput = {
  name: string;
  description: string;
  schedule: AutomationSchedule;
  workflow: AutomationWorkflow;
  timing?: AutomationTiming;
  executionLevel?: AutomationExecutionLevel;
  executionMode?: AutomationExecutionMode;
  snsBatchDays?: SnsBatchDays | null;
  executionFlow?: WorkExecutionFlow;
  enabled?: boolean;
  userId?: string | null;
};

export type UpdateAutomationInput = Partial<
  Pick<
    Automation,
    | "name"
    | "description"
    | "schedule"
    | "workflow"
    | "timing"
    | "executionLevel"
    | "executionMode"
    | "snsBatchDays"
    | "executionFlow"
    | "enabled"
    | "lastRun"
    | "nextRun"
    | "nextRetryAt"
    | "activeSlotKey"
    | "status"
    | "lastWorkflowRunId"
    | "lastError"
    | "lastResultSummary"
    | "currentAttempt"
    | "successCount"
    | "failureCount"
    | "runHistory"
    | "userId"
  >
>;

export type AutomationFilter = {
  enabled?: boolean;
  status?: AutomationStatus | AutomationStatus[];
  ids?: EntityId[];
  userId?: string | null;
};

export type AutomationRunResult = {
  automationId: EntityId;
  workflowRunId: EntityId;
  status: "completed" | "failed" | "retrying";
  orchestrationStatus: "completed" | "failed";
  approved: boolean;
  totalDurationMs: number;
  finalResponsePreview: string | null;
  error: string | null;
  deliverableCount: number;
  attempt: number;
  artifacts: AutomationRunArtifacts | null;
  actions: string[];
  apisUsed: string[];
  nextRetryAt: string | null;
  stoppedAtStage: AutomationDebugStage | null;
  generatedContent: string | null;
};
