/** ISO 8601 timestamp. */
export type Timestamp = string;

/** Opaque UUID primary key. */
export type EntityId = string;

/** Lifecycle status of an automation definition. */
export type AutomationStatus = "idle" | "running" | "success" | "failed";

/** Trigger kinds — schedule is active; others reserved for future integrations. */
export type AutomationTriggerKind =
  | "schedule"
  | "webhook"
  | "email"
  | "calendar";

export type SchedulePreset =
  | { type: "daily"; hour: number; minute: number }
  | { type: "weekly"; dayOfWeek: number; hour: number; minute: number }
  | { type: "monthly"; dayOfMonth: number; hour: number; minute: number };

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

/** Where recurring work should publish when finished. */
export type AutomationDestination = "none" | "x";

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
  /** Publish target — `x` enables real X posting for this recurring job. */
  destination: AutomationDestination;
  enabled: boolean;
  lastRun: Timestamp | null;
  nextRun: Timestamp | null;
  status: AutomationStatus;
  lastWorkflowRunId: EntityId | null;
  lastError: string | null;
  successCount: number;
  failureCount: number;
  /** Compact recent run ledger (durable). */
  runHistory: AutomationRunHistoryEntry[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/** Compact durable run history row (not full orchestration payload). */
export type AutomationRunHistoryEntry = {
  id: EntityId;
  status: "completed" | "failed" | "awaiting_approval";
  startedAt: Timestamp;
  completedAt: Timestamp;
  error: string | null;
  triggerType: "manual" | "automation" | string;
  scheduledAt?: Timestamp | null;
  generatedText?: string | null;
  xPostId?: string | null;
  xPostUrl?: string | null;
  errorCode?: string | null;
  retryCount?: number;
};

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
  destination?: AutomationDestination;
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
    | "destination"
    | "enabled"
    | "lastRun"
    | "nextRun"
    | "status"
    | "lastWorkflowRunId"
    | "lastError"
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
  status: "completed" | "failed" | "awaiting_approval";
  orchestrationStatus: "completed" | "failed" | string;
  approved: boolean;
  totalDurationMs: number;
  finalResponsePreview: string | null;
  error: string | null;
  deliverableCount: number;
  xPostId?: string | null;
  xPostUrl?: string | null;
  errorCode?: string | null;
  dedupeSkipped?: boolean;
};
