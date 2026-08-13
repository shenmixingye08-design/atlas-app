import { describe, expect, it } from "vitest";

import type { AutomationRun } from "@/lib/automation-platform/types/run";

import { buildAutomationRunNotifyCopy } from "./notify-copy";

function runWithStep(
  capabilityId: AutomationRun["steps"][number]["capabilityId"],
  status: AutomationRun["steps"][number]["status"],
): AutomationRun {
  return {
    id: "run_1",
    automationId: "auto_1",
    steps: [
      {
        id: "step_1",
        capabilityId,
        name: "step",
        order: 0,
        status,
        requiresApproval: false,
        highRisk: false,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        attemptCount: 0,
        outputSummary: null,
      },
    ],
  } as AutomationRun;
}

describe("automation run notification copy (A–E)", () => {
  it("B: automation complete uses user language, not status codes", () => {
    const copy = buildAutomationRunNotifyCopy({
      event: "succeeded",
      automationName: "週次X投稿",
      run: runWithStep("x_post", "succeeded"),
    });
    expect(copy.title).toBe("Xへの投稿が完了しました");
    expect(copy.message).toContain("週次X投稿");
    expect(copy.title).not.toMatch(/succeeded|automation_run/i);
    expect(copy.message).not.toMatch(/succeeded|final_success/i);
  });

  it("C: automation failure tells the user what to do", () => {
    const copy = buildAutomationRunNotifyCopy({
      event: "failed",
      automationName: "週次X投稿",
      run: runWithStep("x_post", "failed"),
      detail: "automation_run_failed",
    });
    expect(copy.title).toBe("X投稿に失敗しました");
    expect(copy.message).toContain("再実行できます");
    expect(copy.message).not.toContain("automation_run_failed");
  });

  it("D: approval wait", () => {
    const copy = buildAutomationRunNotifyCopy({
      event: "awaiting_approval",
      automationName: "X投稿",
    });
    expect(copy.title).toBe("実行前の確認が必要です");
    expect(copy.message).toContain("承認すると実行できます");
    expect(copy.title).not.toContain("awaiting_approval");
  });

  it("E: input wait", () => {
    const copy = buildAutomationRunNotifyCopy({
      event: "needs_input",
      automationName: "請求書作成",
    });
    expect(copy.title).toBe("MINERVOTが追加情報を待っています");
    expect(copy.message).toContain("請求書作成");
    expect(copy.title).not.toContain("needs_input");
  });

  it("A: excel complete from capability", () => {
    const copy = buildAutomationRunNotifyCopy({
      event: "succeeded",
      automationName: "月次集計",
      run: runWithStep("excel_generate", "succeeded"),
    });
    expect(copy.title).toBe("Excelファイルが完成しました");
  });
});
