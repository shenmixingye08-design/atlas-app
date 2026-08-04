import { describe, expect, it } from "vitest";

import {
  resolveWorkJobIdFromMetadata,
  withPropagatedJobId,
} from "./job-id";

describe("work-jobs job-id", () => {
  it("prefers jobId over workJobId", () => {
    expect(
      resolveWorkJobIdFromMetadata({
        jobId: "job_a",
        workJobId: "job_b",
      }),
    ).toBe("job_a");
  });

  it("falls back to workJobId for legacy metadata", () => {
    expect(resolveWorkJobIdFromMetadata({ workJobId: "job_legacy" })).toBe(
      "job_legacy",
    );
  });

  it("propagates both keys to the same id", () => {
    expect(withPropagatedJobId({ foo: 1 }, "job_x")).toEqual({
      foo: 1,
      jobId: "job_x",
      workJobId: "job_x",
    });
  });
});
