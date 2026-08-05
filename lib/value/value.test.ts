import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";

import {
  buildValueHomeSnapshot,
  buildValueRoi,
  buildWeeklySecretaryReportText,
  resetValueAnalyticsForTests,
  resetValueStoreForTests,
  summarizeValueAnalytics,
} from "@/lib/value";

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
};

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", {
  localStorage: localStorageMock,
  dispatchEvent: () => true,
});

function project(partial: Partial<Project> & { id: string }): Project {
  const now = new Date().toISOString();
  return {
    title: "営業資料",
    workRequest: "営業資料を作成",
    status: "completed",
    progress: 100,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result: null,
    ...partial,
  };
}

function automation(
  partial: Partial<Automation> & { id: string },
): Automation {
  const now = new Date().toISOString();
  return {
    userId: "u1",
    name: "週次レポート",
    description: "",
    schedule: {
      kind: "schedule",
      preset: { type: "weekly", dayOfWeek: 1, hour: 9, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎週",
    },
    workflow: { assignment: "週次レポート" },
    timing: { startDate: null, endCondition: { type: "never" } },
    executionLevel: "approve_then_run",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: { templateId: "generic", steps: [] },
    destination: "none",
    enabled: true,
    lastRun: now,
    nextRun: null,
    status: "success",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 3,
    failureCount: 0,
    runHistory: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

beforeEach(() => {
  storage.clear();
  resetValueStoreForTests();
  resetValueAnalyticsForTests();
});

describe("value home ROI", () => {
  it("builds hero, meters, roi, report, and rankings without AI jargon", () => {
    const snapshot = buildValueHomeSnapshot({
      projects: [project({ id: "p1", title: "営業資料" })],
      automations: [
        automation({ id: "a1", name: "週次レポート", successCount: 4 }),
      ],
    });

    expect(snapshot.hero.jobsCompleted).toBeGreaterThanOrEqual(1);
    expect(snapshot.meters).toHaveLength(4);
    expect(snapshot.roi.planPriceJpy).toBe(980);
    expect(snapshot.roi.summary).toContain("980");
    expect(snapshot.report.title).toBe("AI秘書レポート");
    expect(snapshot.completedWork[0]?.statusLabel).toBe("完了");
    expect(snapshot.automationRoi[0]?.name).toBe("週次レポート");
    expect(snapshot.pricingBlurb).toContain("ROI");

    const blob = JSON.stringify(snapshot);
    expect(blob).not.toMatch(/\bLLM\b/);
    expect(blob).not.toMatch(/\bPrompt\b/i);
    expect(blob).not.toMatch(/\bToken\b/i);
    expect(blob).not.toMatch(/\bWorkflow\b/);
    expect(blob).not.toMatch(/\bNode\b/);
  });

  it("computes monthly ROI wage from 980 yen", () => {
    const roi = buildValueRoi(18 * 60);
    expect(roi.monthHoursSaved).toBe(18);
    expect(roi.impliedHourlyWageJpy).toBe(Math.round(980 / 18));
    expect(roi.summary).toContain("時給換算");
  });

  it("builds weekly secretary report text", () => {
    const snapshot = buildValueHomeSnapshot({
      projects: [project({ id: "p2" })],
      automations: [],
    });
    const text = buildWeeklySecretaryReportText(snapshot);
    expect(text).toContain("今週のAI秘書レポート");
    expect(text).toContain("終わらせた仕事");
  });

  it("summarizes analytics rates", () => {
    const summary = summarizeValueAnalytics({
      roiMultiple: 2.5,
      monthMinutesSaved: 120,
      automationCount: 2,
      memoryApplyCount: 1,
      deliverableCount: 1,
    });
    expect(summary.roi).toBe(2.5);
    expect(summary.minutesSaved).toBe(120);
    expect(summary.automationRate).toBeGreaterThan(0);
  });
});
