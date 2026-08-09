import { describe, expect, it } from "vitest";

import {
  listDeveloperErrorLogs,
  recordDeveloperError,
  resetDeveloperErrorLogsForTests,
} from "./developer-log";

describe("developer error logs", () => {
  it("stores StackTrace, JobID, WorkflowID, UserID", () => {
    resetDeveloperErrorLogsForTests();
    const err = new Error("OpenAI timeout");
    const entry = recordDeveloperError({
      userId: "user_1",
      jobId: "job_1",
      workflowId: "wf_1",
      commanderRunId: "run_1",
      step: "execute",
      attempt: 2,
      maxAttempts: 4,
      error: err,
      durationMs: 1200,
      processLog: "attempt failed",
    });

    expect(entry.userId).toBe("user_1");
    expect(entry.jobId).toBe("job_1");
    expect(entry.workflowId).toBe("wf_1");
    expect(entry.correlationId).toBe("corr_job_job_1_a2");
    expect(entry.diagnosticId).toBe("diag_job_1");
    expect(entry.stackTrace).toContain("Error: OpenAI timeout");
    expect(entry.failureClass).toBe("timeout");
    expect(entry.cause.length).toBeGreaterThan(0);
    expect(entry.reproduction).toContain("再現");
    expect(entry.fixContent).toContain("修正");

    const listed = listDeveloperErrorLogs({ userId: "user_1", limit: 5 });
    expect(listed[0]?.id).toBe(entry.id);
  });
});
