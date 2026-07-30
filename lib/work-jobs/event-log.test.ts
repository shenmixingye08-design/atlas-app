import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { appendJobEvent, readJobEvents, setWorkJobProgress } from "./event-log";
import { getWorkJob, saveWorkJob, type WorkJobRecord } from "./store";

function baseJob(id: string): WorkJobRecord {
  const now = new Date().toISOString();
  return {
    id,
    userId: "user_events",
    assignment: "Wordで報告書",
    idempotencyKey: `idem-${id}`,
    metadata: {},
    status: "queued",
    blockReason: null,
    attemptCount: 0,
    maxAttempts: 3,
    error: null,
    errorCode: null,
    internalError: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    failedAt: null,
  };
}

describe("work-job event log", () => {
  beforeEach(() => {
    saveWorkJob(baseJob("job_events_1"));
  });

  it("appends accepted → ai → file → storage → notify → completed", () => {
    appendJobEvent("job_events_1", "user_events", {
      type: "accepted",
      phase: "accepted",
    });
    setWorkJobProgress({
      jobId: "job_events_1",
      userId: "user_events",
      phase: "ai_content",
      eventType: "ai_started",
    });
    appendJobEvent("job_events_1", "user_events", {
      type: "ai_finished",
      phase: "ai_content",
      durationMs: 1200,
    });
    setWorkJobProgress({
      jobId: "job_events_1",
      userId: "user_events",
      phase: "generating",
      eventType: "file_gen_started",
    });
    appendJobEvent("job_events_1", "user_events", {
      type: "file_gen_finished",
      phase: "generating",
      deliverableId: "docx-1",
    });
    appendJobEvent("job_events_1", "user_events", {
      type: "storage_finished",
      phase: "saving",
      deliverableId: "docx-1",
    });
    appendJobEvent("job_events_1", "user_events", {
      type: "db_registered",
      phase: "saving",
      deliverableId: "docx-1",
    });
    appendJobEvent("job_events_1", "user_events", {
      type: "notification_sent",
      phase: "notifying",
    });
    appendJobEvent("job_events_1", "user_events", {
      type: "completed",
      phase: "completed",
      durationMs: 5000,
      deliverableId: "docx-1",
    });

    const job = getWorkJob("job_events_1", "user_events");
    const events = readJobEvents(job);
    const types = events.map((e) => e.type);
    expect(types).toContain("accepted");
    expect(types).toContain("ai_started");
    expect(types).toContain("ai_finished");
    expect(types).toContain("file_gen_started");
    expect(types).toContain("file_gen_finished");
    expect(types).toContain("storage_finished");
    expect(types).toContain("db_registered");
    expect(types).toContain("notification_sent");
    expect(types).toContain("completed");
    expect(job?.metadata.progressPhase).toBe("completed");
  });

  it("redacts secrets from failure reasons", () => {
    appendJobEvent("job_events_1", "user_events", {
      type: "failed",
      phase: "failed",
      reason: "Bearer sk-secretTOKEN failed",
    });
    const job = getWorkJob("job_events_1", "user_events");
    const last = readJobEvents(job).at(-1);
    expect(last?.reason).not.toMatch(/sk-secret/);
    expect(last?.reason).toContain("[redacted]");
  });
});
