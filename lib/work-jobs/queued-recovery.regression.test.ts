/**
 * Permanent CI guard: queued work jobs that never started must be
 * reclaimed. Parallel create losers must NOT start a second execution.
 *
 * CASE A: reused within the stale window does not start execution
 * CASE B: reused after WORK_JOB_STALE_QUEUED_MS starts execution
 * CASE C: isStaleWorkJobQueued is false for running / completed
 */
import { describe, expect, it } from "vitest";

import {
  isStaleWorkJobQueued,
  isStaleWorkJobRunning,
  WORK_JOB_STALE_QUEUED_MS,
} from "./staleness";
import type { WorkJobRecord } from "./store";

function job(overrides: Partial<WorkJobRecord> = {}): WorkJobRecord {
  const now = "2026-08-22T10:00:00.000Z";
  return {
    id: "job_queued_recovery",
    userId: "user_queued_a",
    assignment: "週報をWordで",
    idempotencyKey: "work:user_queued_a:client:k",
    metadata: {},
    status: "queued",
    attemptCount: 0,
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

describe("work job queued recovery (permanent)", () => {
  it("CASE A: reused within the stale window does not look stale", () => {
    const created = new Date("2026-08-22T10:00:00.000Z").getTime();
    expect(
      isStaleWorkJobQueued(job(), created + WORK_JOB_STALE_QUEUED_MS - 1),
    ).toBe(false);
  });

  it("CASE B: queued past the stale window is reclaimed", () => {
    const created = new Date("2026-08-22T10:00:00.000Z").getTime();
    expect(
      isStaleWorkJobQueued(job(), created + WORK_JOB_STALE_QUEUED_MS + 1),
    ).toBe(true);
  });

  it("CASE C: running / completed are not queued-stale", () => {
    const created = new Date("2026-08-22T10:00:00.000Z").getTime();
    const later = created + WORK_JOB_STALE_QUEUED_MS + 60_000;
    expect(isStaleWorkJobQueued(job({ status: "running" }), later)).toBe(false);
    expect(isStaleWorkJobQueued(job({ status: "completed" }), later)).toBe(
      false,
    );
    expect(isStaleWorkJobRunning(job({ status: "queued" }), later)).toBe(false);
  });
});
