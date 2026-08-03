import { afterEach, describe, expect, it } from "vitest";

import {
  buildFirstValueDeliverableBody,
  buildFirstValueRoi,
  buildInitialJourneySteps,
  computeRetentionFlags,
  filterFirstValueNotifications,
  formatRoiBasis,
  formatRoiMinutes,
  getFirstValueCandidate,
  getMeasuredMinutesSlices,
  hasFirstValueCompletion,
  isJourneyComplete,
  isJourneyWorkComplete,
  markJourneyStep,
  recordFirstValueMeasured,
  resetFirstValueAnalyticsForTests,
  resetFirstValueMeasuredForTests,
  selectSingleAiProposal,
  takeSingleProposal,
  trackFirstValueEvent,
  listFirstValueEventsForTests,
  FIRST_VALUE_CANDIDATES,
  FIRST_VALUE_FEATURE_EVALUATION,
} from "@/lib/first-value";

describe("Production Blocker #5 first value", () => {
  afterEach(() => {
    resetFirstValueAnalyticsForTests();
    resetFirstValueMeasuredForTests();
  });

  it("exposes feature evaluation as P0", () => {
    expect(FIRST_VALUE_FEATURE_EVALUATION.priority).toBe("P0");
    expect(FIRST_VALUE_FEATURE_EVALUATION.targetMinutes).toBe(15);
  });

  it("lists empty-state candidates including sales/meeting/office docs", () => {
    const labels = FIRST_VALUE_CANDIDATES.map((c) => c.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "営業資料",
        "議事録",
        "メール",
        "画像解析",
        "レシート",
        "請求書",
        "Word",
        "Excel",
        "PowerPoint",
      ]),
    );
  });

  it("builds deterministic deliverable body without LLM", () => {
    const candidate = getFirstValueCandidate("sales_deck");
    const body = buildFirstValueDeliverableBody({
      candidate,
      title: "提案A",
      content: "強みは対応速度です",
    });
    expect(body).toContain("# 提案A");
    expect(body).toContain("強みは対応速度です");
    expect(body).toContain("MINERVOT");
  });

  it("builds 仕事完了一覧 steps with candidate label", () => {
    const steps = buildInitialJourneySteps("営業資料");
    expect(steps.map((s) => s.label)).toEqual([
      "営業資料",
      "保存",
      "通知",
      "ダウンロード",
    ]);
    expect(isJourneyComplete(steps)).toBe(false);
    let next = steps;
    for (const step of steps.filter((s) => s.id !== "downloadable")) {
      next = markJourneyStep(next, step.id, "completed");
    }
    expect(isJourneyWorkComplete(next)).toBe(true);
    expect(isJourneyComplete(next)).toBe(false);
    next = markJourneyStep(next, "downloadable", "completed");
    expect(isJourneyComplete(next)).toBe(true);
  });

  it("records measured minutes so savedMinutes is not forever null", () => {
    expect(hasFirstValueCompletion()).toBe(false);
    recordFirstValueMeasured({
      jobId: "fv_1",
      candidateLabel: "営業資料",
      title: "提案",
      minutesSaved: 45,
      completedAt: new Date().toISOString(),
      deliverableId: "d1",
      automationId: "a1",
    });
    expect(hasFirstValueCompletion()).toBe(true);
    const slices = getMeasuredMinutesSlices();
    expect(slices.today).toBe(45);
    expect(slices.week).toBe(45);
    expect(slices.month).toBe(45);
  });

  it("distinguishes estimated vs measured ROI", () => {
    const roi = buildFirstValueRoi({
      measuredTodayMinutes: 12,
      measuredWeekMinutes: null,
      measuredMonthMinutes: null,
      estimatedTodayMinutes: 45,
      estimatedWeekMinutes: 90,
      estimatedMonthMinutes: 180,
      automationSuccessRate: 0.97,
      memoryApplyRate: null,
    });
    expect(roi.today.basis).toBe("measured");
    expect(roi.week.basis).toBe("estimated");
    expect(formatRoiBasis(roi.today.basis)).toBe("実測");
    expect(formatRoiBasis(roi.week.basis)).toBe("推定");
    expect(formatRoiMinutes(roi.today)).toContain("分");
    expect(roi.hasMeasured).toBe(true);
  });

  it("returns at most one AI proposal", () => {
    const proposal = selectSingleAiProposal([
      { id: "a", title: "週次報告", completedCount: 3 },
      { id: "b", title: "請求書", completedCount: 1 },
    ]);
    expect(proposal?.title).toContain("週次報告");
    expect(takeSingleProposal([1, 2, 3])).toBe(1);
    expect(takeSingleProposal([])).toBeNull();
  });

  it("filters ad/recommendation notifications", () => {
    const filtered = filterFirstValueNotifications([
      { type: "completed" as const },
      { type: "automation" as const },
      { type: "recommendation" as const },
      { type: "billing" as const },
    ]);
    expect(filtered.map((n) => n.type)).toEqual(["completed", "automation"]);
  });

  it("tracks funnel analytics events", () => {
    trackFirstValueEvent("signup_landed");
    trackFirstValueEvent("first_automation_created", { candidateId: "sales_deck" });
    trackFirstValueEvent("first_deliverable_ready", { jobId: "fv_1" });
    trackFirstValueEvent("first_download", { jobId: "fv_1" });
    trackFirstValueEvent("first_value_completed", { jobId: "fv_1" });
    const events = listFirstValueEventsForTests().map((e) => e.name);
    expect(events).toEqual(
      expect.arrayContaining([
        "signup_landed",
        "first_automation_created",
        "first_deliverable_ready",
        "first_download",
        "first_value_completed",
      ]),
    );
    const retention = computeRetentionFlags(Date.now());
    expect(retention.day7).toBe(false);
    expect(retention.day30).toBe(false);
  });
});
