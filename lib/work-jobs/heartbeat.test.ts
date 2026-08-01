import { describe, expect, it } from "vitest";

import {
  saveWorkJob,
  touchWorkJobDurableThrottled,
  type WorkJobRecord,
} from "./store";

function sampleJob(overrides?: Partial<WorkJobRecord>): WorkJobRecord {
  const now = new Date().toISOString();
  return {
    id: `job_${Math.random().toString(36).slice(2, 10)}`,
    userId: "user_heartbeat",
    assignment: "heartbeat test",
    idempotencyKey: `idem_${Math.random().toString(36).slice(2, 10)}`,
    metadata: {},
    status: "running",
    attemptCount: 1,
    maxAttempts: 3,
    error: null,
    visionGate: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides,
  };
}

describe("touchWorkJobDurableThrottled", () => {
  it("updates in-memory updatedAt even when durable persist fails", async () => {
    const job = sampleJob();
    // First save may fail without Supabase — catch and keep memory path.
    try {
      await saveWorkJob(job);
    } catch {
      /* expected without supabase */
    }
    const touched = await touchWorkJobDurableThrottled(job);
    expect(touched.id).toBe(job.id);
    expect(new Date(touched.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(job.updatedAt).getTime(),
    );
  });
});
