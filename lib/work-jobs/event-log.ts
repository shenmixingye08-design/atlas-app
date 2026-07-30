/**
 * Append-only job event log — persisted on WorkJobRecord.metadata.events.
 * Never stores document body, API keys, or PII beyond truncated safe reasons.
 */

import "server-only";

import type { JobProgressPhase } from "./progress";
import { getWorkJob, saveWorkJob, type WorkJobRecord } from "./store";

export const JOB_EVENT_TYPES = [
  "accepted",
  "ai_started",
  "ai_finished",
  "file_gen_started",
  "file_gen_finished",
  "storage_started",
  "storage_finished",
  "db_registered",
  "notification_sent",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
  "progress",
] as const;

export type JobEventType = (typeof JOB_EVENT_TYPES)[number];

export type JobEventRecord = {
  type: JobEventType;
  at: string;
  /** Optional progress phase at this event. */
  phase?: JobProgressPhase | null;
  /** Safe truncated reason (failure / timeout). */
  reason?: string | null;
  /** Optional duration for the step in ms. */
  durationMs?: number | null;
  /** Optional deliverable / artifact id (UUID only). */
  deliverableId?: string | null;
};

const MAX_EVENTS = 80;

function sanitizeReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const trimmed = reason.trim().slice(0, 400);
  if (!trimmed) return null;
  // Strip obvious secrets.
  return trimmed
    .replace(/sk-[a-zA-Z0-9]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

export function readJobEvents(
  job: WorkJobRecord | null | undefined,
): JobEventRecord[] {
  const raw = job?.metadata?.events;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is JobEventRecord =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as JobEventRecord).type === "string" &&
          typeof (item as JobEventRecord).at === "string",
      ),
  );
}

export function appendJobEvent(
  jobId: string,
  userId: string,
  event: Omit<JobEventRecord, "at"> & { at?: string },
): WorkJobRecord | null {
  const job = getWorkJob(jobId, userId);
  if (!job) return null;

  const nextEvent: JobEventRecord = {
    type: event.type,
    at: event.at ?? new Date().toISOString(),
    phase: event.phase ?? null,
    reason: sanitizeReason(event.reason),
    durationMs:
      typeof event.durationMs === "number" && Number.isFinite(event.durationMs)
        ? Math.max(0, Math.round(event.durationMs))
        : null,
    deliverableId: event.deliverableId ?? null,
  };

  const events = [...readJobEvents(job), nextEvent].slice(-MAX_EVENTS);
  const progressPhase = event.phase ?? job.metadata?.progressPhase ?? null;

  return saveWorkJob({
    ...job,
    updatedAt: nextEvent.at,
    metadata: {
      ...job.metadata,
      events,
      ...(progressPhase
        ? { progressPhase, progressUpdatedAt: nextEvent.at }
        : {}),
      lastEventType: nextEvent.type,
      lastEventAt: nextEvent.at,
    },
  });
}

/**
 * Set progress phase (+ optional event) without changing canonical status.
 */
export function setWorkJobProgress(input: {
  jobId: string;
  userId: string;
  phase: JobProgressPhase;
  eventType?: JobEventType;
  reason?: string | null;
  deliverableId?: string | null;
  durationMs?: number | null;
}): WorkJobRecord | null {
  const job = getWorkJob(input.jobId, input.userId);
  if (!job) return null;

  const at = new Date().toISOString();
  const events = [...readJobEvents(job)];
  if (input.eventType) {
    events.push({
      type: input.eventType,
      at,
      phase: input.phase,
      reason: sanitizeReason(input.reason),
      durationMs: input.durationMs ?? null,
      deliverableId: input.deliverableId ?? null,
    });
  } else {
    events.push({
      type: "progress",
      at,
      phase: input.phase,
      reason: null,
      durationMs: null,
      deliverableId: input.deliverableId ?? null,
    });
  }

  return saveWorkJob({
    ...job,
    updatedAt: at,
    metadata: {
      ...job.metadata,
      events: events.slice(-MAX_EVENTS),
      progressPhase: input.phase,
      progressUpdatedAt: at,
      lastEventType: input.eventType ?? "progress",
      lastEventAt: at,
    },
  });
}

export function readProgressPhase(
  job: WorkJobRecord | null | undefined,
): JobProgressPhase | null {
  const raw = job?.metadata?.progressPhase;
  if (
    typeof raw === "string" &&
    [
      "accepted",
      "ai_content",
      "generating",
      "saving",
      "notifying",
      "completed",
      "failed",
    ].includes(raw)
  ) {
    return raw as JobProgressPhase;
  }
  return null;
}

export function readTimeoutReason(
  job: WorkJobRecord | null | undefined,
): string | null {
  const raw = job?.metadata?.timeoutReason;
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 240) : null;
}
