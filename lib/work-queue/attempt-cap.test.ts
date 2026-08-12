import { describe, expect, it } from "vitest";

import {
  capWorkQueueAttempt,
  extractPostgresConstraintName,
  isWorkQueueAttemptExhausted,
} from "./attempt-cap";

describe("work-queue attempt cap (atlas_work_queue_jobs_attempt_check)", () => {
  it("caps attempt at max_attempts + 1", () => {
    expect(capWorkQueueAttempt(0, 5)).toBe(0);
    expect(capWorkQueueAttempt(5, 5)).toBe(5);
    expect(capWorkQueueAttempt(6, 5)).toBe(6);
    expect(capWorkQueueAttempt(7, 5)).toBe(6);
    expect(capWorkQueueAttempt(100, 3)).toBe(4);
  });

  it("treats attempt >= max_attempts as exhausted", () => {
    expect(isWorkQueueAttemptExhausted(4, 5)).toBe(false);
    expect(isWorkQueueAttemptExhausted(5, 5)).toBe(true);
    expect(isWorkQueueAttemptExhausted(6, 5)).toBe(true);
  });

  it("extracts constraint name from Postgres driver messages", () => {
    expect(
      extractPostgresConstraintName(
        'new row for relation "atlas_work_queue_jobs" violates check constraint "atlas_work_queue_jobs_attempt_check"',
      ),
    ).toBe("atlas_work_queue_jobs_attempt_check");
  });
});
