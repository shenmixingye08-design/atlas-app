export type AutomationExecutionLogEntry = {
  id: string;
  automationId: string;
  userId: string | null;
  scheduledAt: string | null;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "success" | "failed" | "awaiting_approval" | "skipped";
  generatedText: string | null;
  xPostId: string | null;
  xPostUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  /** Safe X API summary — never tokens. */
  xApiSummary: string | null;
  triggerType: string;
};

export type AutomationCronDebugSnapshot = {
  lastTickAt: string | null;
  lastTickOk: boolean | null;
  lastTickError: string | null;
  dueCount: number;
  successCount: number;
  failureCount: number;
};
