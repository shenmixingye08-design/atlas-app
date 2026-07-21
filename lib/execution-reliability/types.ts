/** Client-persisted execution lifecycle for UX reliability (not pipeline core). */

export type ExecutionPhase =
  | "queued"
  | "running"
  | "retrying"
  | "timed_out"
  | "failed"
  | "completed"
  | "cancelled";

export type ExecutionLogEntry = {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: string | null;
};

export type ExecutionStateRecord = {
  id: string;
  userKey: string;
  assignmentPreview: string;
  phase: ExecutionPhase;
  startedAt: string;
  updatedAt: string;
  attempt: number;
  maxAttempts: number;
  timeoutMs: number;
  timedOut: boolean;
  failureReason: string | null;
  projectId: string | null;
  notificationGuaranteed: boolean;
  logs: ExecutionLogEntry[];
};
