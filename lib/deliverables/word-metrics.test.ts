import { beforeEach, describe, expect, it } from "vitest";

import {
  getWordReleaseMonitoringSnapshot,
  recordWordMetric,
  resetWordMetricsForTests,
} from "./word-metrics";

describe("word release monitoring metrics", () => {
  beforeEach(() => {
    resetWordMetricsForTests();
  });

  it("aggregates required release counters without PII", () => {
    recordWordMetric("request");
    recordWordMetric("request");
    recordWordMetric("success");
    recordWordMetric("failure", 1, { stage: "docx", message: "docx_packer" });
    recordWordMetric("timeout", 1, { stage: "timeout", message: "work_job_timed_out" });
    recordWordMetric("notify_failure", 1, {
      stage: "notify",
      message: "notification_emit_failed",
    });
    recordWordMetric("download_failure", 1, {
      stage: "download",
      message: "lookup",
    });
    recordWordMetric("total_ms", 1200);
    recordWordMetric("total_ms", 800);

    const snap = getWordReleaseMonitoringSnapshot();
    expect(snap.wordRequests).toBe(2);
    expect(snap.successes).toBe(1);
    expect(snap.failures).toBe(1);
    expect(snap.timeouts).toBe(1);
    expect(snap.successRate).toBeCloseTo(1 / 3, 5);
    expect(snap.avgProcessingMs).toBe(1000);
    expect(snap.notificationCreateFailures).toBe(1);
    expect(snap.downloadFailures).toBe(1);
    expect(snap.errorsByStage.docx).toBe(1);
    expect(snap.errorsByStage.timeout).toBe(1);
    expect(snap.errorsByStage.notify).toBe(1);
    expect(snap.errorsByStage.download).toBe(1);
    expect(snap.containsPii).toBe(false);
    expect(JSON.stringify(snap)).not.toMatch(/@|顧客名|本文/);
  });
});
