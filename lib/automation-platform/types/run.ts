import type { ResolvedInstruction } from "./instruction";
import type { MemoryReferenceRecord } from "./memory-policy";
import type { AutomationRunStatus } from "./status";

export type Timestamp = string;
export type EntityId = string;

export type RunActor =
  | { type: "user"; userId: string }
  | { type: "system"; component: string }
  | { type: "scheduler"; component: string }
  | { type: "worker"; component: string };

export type AutomationRunStatusTransition = {
  previousStatus: AutomationRunStatus;
  nextStatus: AutomationRunStatus;
  timestamp: Timestamp;
  reason: string;
  actor: RunActor;
  diagnosticId: string;
};

export type AutomationRun = {
  id: EntityId;
  automationId: EntityId;
  userId: string;
  status: AutomationRunStatus;
  /** Stable key for this logical run (automation + occurrence). */
  runKey: string;
  /** Client/API idempotency key when provided. */
  idempotencyKey: string;
  /** Unique key for a scheduled occurrence slot. */
  scheduleOccurrenceKey: string | null;
  triggerType: "manual" | "schedule" | "event" | "condition" | "retry";
  scheduledFor: Timestamp | null;
  queuedAt: Timestamp | null;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  resolvedInstruction: ResolvedInstruction | null;
  memoryReferences: MemoryReferenceRecord[];
  statusHistory: AutomationRunStatusTransition[];
  approvalExpiresAt: Timestamp | null;
  resultSummary: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type CreateAutomationRunInput = {
  automationId: EntityId;
  userId: string;
  triggerType: AutomationRun["triggerType"];
  scheduledFor?: Timestamp | null;
  runKey: string;
  idempotencyKey: string;
  scheduleOccurrenceKey?: string | null;
  maxAttempts?: number;
  approvalExpiresAt?: Timestamp | null;
  initialStatus?: AutomationRunStatus;
  actor: RunActor;
  reason: string;
};
