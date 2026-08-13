import { describe, expect, it } from "vitest";

import type { Automation } from "@/lib/automations/types";
import {
  buildHomeAttentionItems,
  buildHomeSummary,
  buildTodayJobsFromAutomations,
  greetingForHour,
  jobsToTimelineItems,
} from "@/lib/automation-first/home-model";
import {
  listAutomationFirstEventsForTests,
  resetAutomationFirstAnalyticsForTests,
  trackAutomationFirstEvent,
} from "@/lib/automation-first/analytics";
import { AUTOMATION_FIRST_SIDEBAR_PRIMARY } from "@/lib/automation-first/nav";

function sampleAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "a1",
    userId: "u1",
    name: "週次営業資料",
    description: "毎週の営業資料",
    enabled: true,
    status: "idle",
    schedule: {
      kind: "schedule",
      preset: { type: "weekly", dayOfWeek: 5, hour: 18, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎週金曜 18:00",
    },
    workflow: { assignment: "営業資料を作る" },
    timing: { startDate: null, endCondition: { type: "never" } },
    executionLevel: "full_auto",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: {
      templateId: "sales_material",
      steps: [{ id: "draft", enabled: true }],
    },
    destination: "none",
    lastRun: null,
    nextRun: "2026-08-07T09:00:00.000Z",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("automation-first home model", () => {
  it("builds empty-friendly summary for zero automations", () => {
    const jobs = buildTodayJobsFromAutomations([]);
    const attention = buildHomeAttentionItems([]);
    const summary = buildHomeSummary([], jobs, attention);
    expect(summary.activeAutomationCount).toBe(0);
    expect(summary.attentionCount).toBe(0);
    expect(jobsToTimelineItems(jobs)).toEqual([]);
  });

  it("surfaces failed automations as attention", () => {
    const items = buildHomeAttentionItems([
      sampleAutomation({ id: "f1", status: "failed", name: "失敗した仕事" }),
    ]);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.kind).toBe("failed");
  });

  it("maps enabled automations into timeline statuses", () => {
    const jobs = buildTodayJobsFromAutomations([
      sampleAutomation({ status: "running" }),
      sampleAutomation({ id: "a2", status: "idle", enabled: true }),
    ]);
    const timeline = jobsToTimelineItems(jobs);
    expect(timeline.length).toBe(2);
    expect(timeline.some((t) => t.status === "running")).toBe(true);
  });

  it("greeting changes by hour", () => {
    expect(greetingForHour(9)).toContain("おはよう");
    expect(greetingForHour(14)).toContain("こんにちは");
    expect(greetingForHour(20)).toContain("お疲れ");
  });
});

describe("automation-first analytics", () => {
  it("records home_viewed without throwing", () => {
    resetAutomationFirstAnalyticsForTests();
    trackAutomationFirstEvent("home_viewed", { automations: 0 });
    const events = listAutomationFirstEventsForTests();
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe("home_viewed");
  });

  it("records the two home primary action events separately", () => {
    resetAutomationFirstAnalyticsForTests();
    trackAutomationFirstEvent("home_primary_one_time_clicked", {
      source: "home_primary",
    });
    trackAutomationFirstEvent("home_primary_automation_clicked", {
      source: "home_primary",
    });
    const names = listAutomationFirstEventsForTests().map((event) => event.name);
    expect(names).toEqual([
      "home_primary_one_time_clicked",
      "home_primary_automation_clicked",
    ]);
  });
});

describe("automation-first navigation", () => {
  it("puts automations before settings in sidebar", () => {
    const labels = AUTOMATION_FIRST_SIDEBAR_PRIMARY.map((i) => i.label);
    expect(labels.indexOf("自動化")).toBeLessThan(labels.indexOf("設定"));
    expect(labels[0]).toBe("ホーム");
    expect(labels).toContain("今日の仕事");
    expect(labels).toContain("連携");
    expect(labels).toContain("実行履歴");
  });
});
