/** Durable automation job lifecycle — DB is source of truth. */

export type JobStatus =
  | "scheduled"
  | "queued"
  | "running"
  | "retrying"
  | "waiting_for_approval"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

export type JobPushStatus = "pending" | "sent" | "failed" | "skipped";

export type JobStepEvidence = {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  at: string;
};

export type JobRecord = {
  id: string;
  userId: string;
  automationId: string | null;
  jobType: string;
  status: JobStatus;
  scheduledAt: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  currentStep: string | null;
  progressPercent: number;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  resultSummary: string | null;
  artifactId: string | null;
  externalResultId: string | null;
  externalResultUrl: string | null;
  idempotencyKey: string;
  pushStatus: JobPushStatus;
  autoRecovered: boolean;
  steps: JobStepEvidence[];
  createdAt: string;
  updatedAt: string;
};

export type ClaimJobResult =
  | { action: "created"; record: JobRecord }
  | { action: "resume"; record: JobRecord }
  | { action: "skip"; record: JobRecord; reason: string };

export type JobMetrics24h = {
  total: number;
  completed: number;
  failed: number;
  retrying: number;
  recovered: number;
  hung: number;
  dedupeSkips: number;
  pushOk: number;
  pushFailed: number;
  pushInvalidDevices: number;
  generatedAt: string;
};
