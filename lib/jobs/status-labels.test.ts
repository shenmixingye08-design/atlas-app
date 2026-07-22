import { describe, expect, it } from "vitest";

import {
  getJobStatusLabel,
  isJobActive,
  isJobTerminal,
  JOB_STATUS_LABELS,
} from "./status-labels";
import type { JobStatus } from "./types";

describe("job status labels", () => {
  it("covers every JobStatus with unified Japanese labels", () => {
    const statuses: JobStatus[] = [
      "scheduled",
      "queued",
      "running",
      "retrying",
      "waiting_for_approval",
      "completed",
      "partially_completed",
      "failed",
      "cancelled",
    ];
    for (const status of statuses) {
      expect(JOB_STATUS_LABELS[status]).toBeTruthy();
      expect(getJobStatusLabel(status)).toBe(JOB_STATUS_LABELS[status]);
    }
  });

  it("uses required unified terminology", () => {
    expect(getJobStatusLabel("running")).toBe("実行中");
    expect(getJobStatusLabel("completed")).toBe("完了");
    expect(getJobStatusLabel("failed")).toBe("失敗");
    expect(getJobStatusLabel("waiting_for_approval")).toBe("承認待ち");
    expect(getJobStatusLabel("retrying")).toBe("自動復旧中");
    expect(getJobStatusLabel("cancelled")).toBe("停止中");
    expect(getJobStatusLabel("partially_completed")).toBe("確認が必要");
  });

  it("classifies active vs terminal", () => {
    expect(isJobActive("running")).toBe(true);
    expect(isJobActive("retrying")).toBe(true);
    expect(isJobTerminal("completed")).toBe(true);
    expect(isJobTerminal("failed")).toBe(true);
  });
});
