import { describe, expect, it } from "vitest";

import {
  JOB_ACCEPTED_DESCRIPTION,
  JOB_ACCEPTED_TITLE,
  JOB_PROGRESS_LABELS,
  JOB_SLOW_BANNER,
  computeJobElapsedMs,
  isJobTakingLonger,
  progressPhaseFromJobStatus,
  progressPhaseFromWordStage,
} from "./progress";

describe("work-job progress", () => {
  it("maps word stages to secretary progress phases", () => {
    expect(progressPhaseFromWordStage("REQUEST_RECEIVED")).toBe("accepted");
    expect(progressPhaseFromWordStage("AI_CONTENT_STARTED")).toBe("ai_content");
    expect(progressPhaseFromWordStage("DOCX_GENERATION_STARTED")).toBe(
      "generating",
    );
    expect(progressPhaseFromWordStage("DOCX_STORAGE_STARTED")).toBe("saving");
    expect(progressPhaseFromWordStage("NOTIFICATION_SENT")).toBe("notifying");
    expect(progressPhaseFromWordStage("COMPLETED")).toBe("completed");
  });

  it("exposes emoji progress labels", () => {
    expect(JOB_PROGRESS_LABELS.ai_content).toContain("AIで内容作成中");
    expect(JOB_PROGRESS_LABELS.generating).toContain("成果物生成中");
    expect(JOB_PROGRESS_LABELS.saving).toContain("保存中");
    expect(JOB_PROGRESS_LABELS.notifying).toContain("通知準備中");
  });

  it("detects slow processing after threshold", () => {
    const now = Date.now();
    expect(
      isJobTakingLonger({
        status: "processing",
        startedAt: new Date(now - 100_000).toISOString(),
        nowMs: now,
        thresholdMs: 90_000,
      }),
    ).toBe(true);
    expect(
      isJobTakingLonger({
        status: "processing",
        startedAt: new Date(now - 10_000).toISOString(),
        nowMs: now,
        thresholdMs: 90_000,
      }),
    ).toBe(false);
    expect(
      isJobTakingLonger({
        status: "completed",
        startedAt: new Date(now - 100_000).toISOString(),
        nowMs: now,
      }),
    ).toBe(false);
    expect(JOB_SLOW_BANNER).toContain("通常より時間がかかっています");
    expect(JOB_ACCEPTED_TITLE).toBe("かしこまりました。");
    expect(JOB_ACCEPTED_DESCRIPTION).toContain("ご依頼を受け付けました");
  });

  it("computes elapsed and status→phase mapping", () => {
    const now = Date.now();
    expect(
      computeJobElapsedMs({
        startedAt: new Date(now - 5_000).toISOString(),
        nowMs: now,
      }),
    ).toBeGreaterThanOrEqual(4_900);
    expect(progressPhaseFromJobStatus("queued")).toBe("accepted");
    expect(progressPhaseFromJobStatus("processing", "saving")).toBe("saving");
    expect(progressPhaseFromJobStatus("completed")).toBe("completed");
    expect(progressPhaseFromJobStatus("timed_out")).toBe("failed");
  });
});
