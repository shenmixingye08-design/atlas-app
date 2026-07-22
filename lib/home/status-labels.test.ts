import { describe, expect, it } from "vitest";

import {
  getTodayJobStatusLabel,
  TODAY_JOB_STATUS_LABELS,
} from "./status-labels";

describe("today job status labels", () => {
  it("maps awaiting_review to 承認待ち", () => {
    expect(getTodayJobStatusLabel("awaiting_review")).toBe("承認待ち");
    expect(TODAY_JOB_STATUS_LABELS.running).toBe("実行中");
  });
});
