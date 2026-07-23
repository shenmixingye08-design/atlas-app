/** Durable execution log for owner monitoring of recurring AI work. */

import type { AutomationDebugStage } from "../types";

export type AutomationExecutionLogEvent =
  | "started"
  | "retry_scheduled"
  | "completed"
  | "failed";

export type AutomationExecutionLogEntry = {
  id: string;
  userId: string | null;
  automationId: string;
  automationName: string;
  workflowRunId: string | null;
  triggerType: string;
  event: AutomationExecutionLogEvent;
  status: "completed" | "failed" | "retrying" | "running";
  attempt: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  /** Human-readable actions the AI/system performed. */
  actions: string[];
  /** External/API names used (openai, x_api, deliverables, ...). */
  apisUsed: string[];
  templateId: string | null;
  error: string | null;
  artifactUrls: string[];
  tweetUrl: string | null;
  tweetId: string | null;
  generatedContent: string | null;
  aiRan: boolean;
  xApiCalled: boolean;
  stoppedAtStage: AutomationDebugStage | null;
  nextRetryAt: string | null;
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
