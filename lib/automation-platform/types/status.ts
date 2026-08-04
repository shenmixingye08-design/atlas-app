/** Lifecycle of an Automation definition (not a single run). */
export type AutomationDefinitionStatus =
  | "draft"
  | "active"
  | "paused"
  | "disabled"
  | "archived";

/** Lifecycle of a single Automation Run instance. */
export type AutomationRunStatus =
  | "scheduled"
  | "preparing"
  | "awaiting_approval"
  | "queued"
  | "running"
  | "retrying"
  | "needs_input"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "skipped"
  | "cancelled"
  | "expired";

export const AUTOMATION_DEFINITION_STATUSES = [
  "draft",
  "active",
  "paused",
  "disabled",
  "archived",
] as const satisfies readonly AutomationDefinitionStatus[];

export const AUTOMATION_RUN_STATUSES = [
  "scheduled",
  "preparing",
  "awaiting_approval",
  "queued",
  "running",
  "retrying",
  "needs_input",
  "succeeded",
  "partially_succeeded",
  "failed",
  "skipped",
  "cancelled",
  "expired",
] as const satisfies readonly AutomationRunStatus[];

export const TERMINAL_RUN_STATUSES: readonly AutomationRunStatus[] = [
  "succeeded",
  "partially_succeeded",
  "failed",
  "skipped",
  "cancelled",
  "expired",
] as const;
