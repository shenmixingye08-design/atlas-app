import { describe, expect, it } from "vitest";

import { appendAttemptHistory } from "@/lib/vision/job-phase";
import { isWorkJobTerminal } from "@/lib/work-jobs/run";

describe("reanalyze attempt history / idempotency", () => {
  it("appends attempt history without overwriting prior errors", () => {
    const first = appendAttemptHistory([], {
      attempt: 1,
      phase: "failed",
      errorCode: "timeout",
      errorMessage: "vision_openai_timeout",
      openaiRequestId: "req_1",
      startedAt: "2026-08-01T00:00:00.000Z",
      finishedAt: "2026-08-01T00:01:00.000Z",
      durationMs: 60_000,
    });
    const second = appendAttemptHistory(first, {
      attempt: 2,
      phase: "completed",
      errorCode: null,
      errorMessage: null,
      openaiRequestId: "req_2",
      startedAt: "2026-08-01T00:02:00.000Z",
      finishedAt: "2026-08-01T00:03:00.000Z",
      durationMs: 40_000,
    });
    expect(second).toHaveLength(2);
    expect(second[0]?.errorCode).toBe("timeout");
    expect(second[1]?.phase).toBe("completed");
  });

  it("treats needs_input and completed as terminal (no duplicate execution)", () => {
    expect(isWorkJobTerminal("completed")).toBe(true);
    expect(isWorkJobTerminal("needs_input")).toBe(true);
    expect(isWorkJobTerminal("failed")).toBe(true);
    expect(isWorkJobTerminal("analyzing")).toBe(false);
    expect(isWorkJobTerminal("retrying")).toBe(false);
  });
});
