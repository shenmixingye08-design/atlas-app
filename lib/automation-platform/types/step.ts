/** Capability identifiers that steps may invoke. */
export type AutomationCapabilityId =
  | "vision_analysis"
  | "ocr"
  | "word_generate"
  | "excel_generate"
  | "pdf_generate"
  | "powerpoint_generate"
  | "file_convert"
  | "data_extract"
  | "gmail"
  | "x_post"
  | "google_calendar"
  | "wordpress"
  | "dropbox"
  | "google_drive"
  | "notify"
  | "await_approval"
  | "condition"
  | "wait"
  | "orchestrate"
  | "deliverable_generate";

export type StepRiskLevel = "low" | "medium" | "high";

export type StepRetryPolicy = {
  maxAttempts: number;
  backoffMs: number[];
  retryableErrorCodes?: string[];
};

export type AutomationWorkflowStep = {
  id: string;
  type: AutomationCapabilityId;
  name: string;
  order: number;
  inputBindings: Readonly<Record<string, unknown>>;
  configuration: Readonly<Record<string, unknown>>;
  requiresApproval: boolean;
  retryPolicy: StepRetryPolicy;
  timeoutMs: number;
  onSuccess: string | null;
  onFailure: string | null;
  enabled: boolean;
};

export type WorkflowFailurePolicy = {
  strategy: "stop" | "continue" | "retry_workflow";
  notify: boolean;
};

export type WorkflowTimeoutPolicy = {
  workflowTimeoutMs: number;
  stepDefaultTimeoutMs: number;
};

export type AutomationWorkflowDefinition = {
  version: number;
  steps: AutomationWorkflowStep[];
  onFailure: WorkflowFailurePolicy;
  timeoutPolicy: WorkflowTimeoutPolicy;
};
