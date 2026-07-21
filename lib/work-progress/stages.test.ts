import { describe, expect, it } from "vitest";

import {
  buildStageViews,
  estimateStageFromElapsed,
  mapRunStatusToStage,
  WORK_PROGRESS_STAGES,
} from "./stages";
import { estimateWorkEta } from "./eta";
import { buildWorkFailureInfo } from "./failure";
import { defaultMessagesForStage, ensureStageLogs } from "./action-logs";

describe("work progress stages", () => {
  it("exposes exactly 6 stages", () => {
    expect(WORK_PROGRESS_STAGES).toEqual([
      "accepted",
      "analyzing",
      "executing",
      "generating",
      "reviewing",
      "delivered",
    ]);
  });

  it("marks the current stage while keeping prior stages done", () => {
    const views = buildStageViews({ current: "executing" });
    expect(views.find((s) => s.id === "accepted")?.status).toBe("done");
    expect(views.find((s) => s.id === "executing")?.status).toBe("current");
    expect(views.find((s) => s.id === "delivered")?.status).toBe("upcoming");
  });

  it("advances stages from elapsed time vs ETA", () => {
    expect(
      estimateStageFromElapsed({ elapsedMs: 1_000, etaMs: 120_000 }),
    ).toBe("accepted");
    expect(
      estimateStageFromElapsed({ elapsedMs: 40_000, etaMs: 120_000 }),
    ).toBe("executing");
    expect(
      estimateStageFromElapsed({ elapsedMs: 1, etaMs: 30_000, completed: true }),
    ).toBe("delivered");
  });

  it("maps run status to stages", () => {
    expect(mapRunStatusToStage({ status: "planning" })).toBe("accepted");
    expect(mapRunStatusToStage({ status: "completed" })).toBe("delivered");
    expect(
      mapRunStatusToStage({
        status: "running",
        reliabilityStage: "generating",
      }),
    ).toBe("generating");
  });
});

describe("work ETA", () => {
  it("estimates short ETA for simple posts", () => {
    const eta = estimateWorkEta("Xに一言投稿して");
    expect(["30s", "2m"]).toContain(eta.bucket);
    expect(eta.label).toMatch(/約/);
  });

  it("estimates longer ETA for image + research jobs", () => {
    const eta = estimateWorkEta(
      "競合を調査して提案資料を作り、サムネイル画像も生成して",
    );
    expect(["5m", "10m"]).toContain(eta.bucket);
  });
});

describe("work failure + logs", () => {
  it("builds failure info with cause and stopped stage", () => {
    const failure = buildWorkFailureInfo({
      error: "Request timeout",
      stoppedAtStage: "generating",
      attempt: 1,
      maxAttempts: 3,
      autoRetrying: true,
    });
    expect(failure.cause).toContain("時間内");
    expect(failure.stoppedAtLabel).toBe("成果物生成");
    expect(failure.autoRetry).toBe(true);
    expect(failure.canRetry).toBe(true);
  });

  it("creates stage action logs for SNS work", () => {
    const messages = defaultMessagesForStage(
      "executing",
      "X投稿内容を作成して予約して",
    );
    expect(messages[0]).toMatch(/投稿|生成|実行/);
    const logs = ensureStageLogs([], "accepted", "X投稿して");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]?.stage).toBe("accepted");
  });
});
