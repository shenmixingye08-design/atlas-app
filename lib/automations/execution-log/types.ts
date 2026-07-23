/** Durable execution log for owner monitoring of recurring AI work. */

export type AutomationExecutionLogEntry = {
  id: string;
  userId: string | null;
  automationId: string;
  automationName: string;
  workflowRunId: string | null;
  triggerType: string;
  status: "completed" | "failed" | "retrying";
  attempt: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  /** Human-readable actions the AI/system performed. */
  actions: string[];
  /** External/API names used (openai, x_api, deliverables, ...). */
  apisUsed: string[];
  templateId: string | null;
  error: string | null;
  artifactUrls: string[];
  createdAt: string;
};

export type AutomationExecutionLogSnapshot = {
  entries: AutomationExecutionLogEntry[];
  totals: {
    runs: number;
    completed: number;
    failed: number;
    successRate: number;
    averageDurationMs: number;
  };
  updatedAt: string;
};
