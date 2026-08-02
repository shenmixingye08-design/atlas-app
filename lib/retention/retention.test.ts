import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetActivationStateForTests,
  markActivationCompleted,
} from "@/lib/activation/store";
import { resetUserWorkProfile } from "@/lib/user-profile";

import { applySurveyToRetention } from "./apply-survey";
import { resolveRetentionDayNumber, resolveDayStatus } from "./day-plan";
import { completeRetentionWizard, recordFirstWinDeliverable } from "./first-win";
import { buildRetentionValueStats } from "./gamification";
import { buildHomeBootstrapItems } from "./home-bootstrap";
import { getRetentionRatesSummary, recordRetentionActivity } from "./metrics";
import {
  emitRetentionNotification,
  RETENTION_ALLOWED_NOTIFICATION_TYPES,
} from "./notifications";
import { resolveQuickWin } from "./quick-win";
import {
  loadRetentionState,
  resetRetentionStateForTests,
  shouldShowRetentionSurvey,
} from "./store";
import { buildNextAutomateSuggestions } from "./suggestions";
import {
  listRetentionEventsForTests,
  resetRetentionAnalyticsForTests,
} from "./analytics";

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

beforeEach(() => {
  storage.clear();
  resetUserWorkProfile();
  resetRetentionStateForTests();
  resetActivationStateForTests();
  resetRetentionAnalyticsForTests();
});

describe("retention first-win", () => {
  it("completes wizard, seeds tasks, and returns Quick Win href", () => {
    const result = completeRetentionWizard({
      workDescription: "毎週の営業報告",
      company: "ACME",
      roleId: "sales",
      preferredTasks: ["sales_material", "email"],
      integrations: ["google", "calendar"],
      entryMode: "guide",
    });

    expect(result.quickWinHref).toBe("/activation/weekly-report");
    expect(result.preferredTasks).toContain("sales_material");
    expect(loadRetentionState().wizard.company).toBe("ACME");
    expect(listRetentionEventsForTests().map((e) => e.name)).toContain(
      "retention_wizard_completed",
    );
  });

  it("maps every role to a real Quick Win deliverable path", () => {
    for (const roleId of ["sales", "sns", "office", "executive", "freelance", "other"] as const) {
      const qw = resolveQuickWin({ roleId });
      expect(qw.href).toBe("/activation/weekly-report");
      expect(qw.deliverableLabel.length).toBeGreaterThan(0);
    }
  });

  it("records first win deliverable and Day1 completion", () => {
    markActivationCompleted({
      automationId: "a1",
      runId: "r1",
      artifactUrl: "/api/artifacts/1",
    });
    recordFirstWinDeliverable("/projects/a1");
    const state = loadRetentionState();
    expect(state.dayPlan.find((d) => d.day === 1)?.completedAt).toBeTruthy();
    expect(state.successDayKeys.length).toBe(1);
    expect(shouldShowRetentionSurvey(state, true)).toBe(true);
  });

  it("builds non-empty home bootstrap", () => {
    completeRetentionWizard({
      workDescription: "日報",
      company: "Office Co",
      roleId: "office",
      preferredTasks: ["files"],
      integrations: ["dropbox"],
      entryMode: "guide",
    });
    const items = buildHomeBootstrapItems();
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.some((i) => i.kind === "recommended_work")).toBe(true);
    expect(items.some((i) => i.kind === "quick_deliverable")).toBe(true);
    expect(items.some((i) => i.kind === "popular_automation")).toBe(true);
  });

  it("suggests unused features only", () => {
    completeRetentionWizard({
      workDescription: "SNS",
      company: "",
      roleId: "sns",
      preferredTasks: ["sns"],
      integrations: ["x"],
      entryMode: "guide",
    });
    const suggestions = buildNextAutomateSuggestions({ automations: [] });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions[0]?.href).toBeTruthy();
  });

  it("applies survey to memory/ui hints without AI", () => {
    const applied = applySurveyToRetention({
      helpful: "yes",
      revision: "light",
      reuse: "yes",
    });
    expect(applied.suggestionBias).toBe("automate_more");
    expect(loadRetentionState().survey?.helpful).toBe("yes");
    expect(loadRetentionState().dayPlan.find((d) => d.day === 2)?.completedAt).toBeTruthy();
  });

  it("throttles retention notifications to one per type per day", () => {
    expect(RETENTION_ALLOWED_NOTIFICATION_TYPES).toEqual([
      "deliverable",
      "suggestion",
      "memory",
      "automation",
    ]);
    const first = emitRetentionNotification("deliverable", {
      title: "a",
      message: "b",
      href: "/projects",
    });
    const second = emitRetentionNotification("deliverable", {
      title: "a2",
      message: "b2",
      href: "/projects",
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("computes value stats and secretary level", () => {
    recordFirstWinDeliverable("/projects/x");
    const stats = buildRetentionValueStats({
      deliverableCount: 2,
      automationSuccessCount: 1,
      memoryCompletionPercent: 40,
    });
    expect(stats.deliverableCount).toBe(2);
    expect(stats.secretaryLevel).toBeGreaterThanOrEqual(1);
    expect(stats.estimatedMinutesSaved).toBeGreaterThan(0);
  });

  it("tracks cohort activity for retention windows", () => {
    const cohort = recordRetentionActivity(new Date("2026-08-02T10:00:00.000Z"));
    expect(cohort.activeDayKeys.length).toBe(1);
    const summary = getRetentionRatesSummary(cohort);
    expect(summary.activeDays).toBe(1);
    expect(summary.day7).toBeNull();
  });

  it("resolves day plan status", () => {
    expect(resolveRetentionDayNumber("2026-08-02T00:00:00.000Z", new Date("2026-08-02"))).toBe(1);
    expect(resolveRetentionDayNumber("2026-08-01T00:00:00.000Z", new Date("2026-08-03"))).toBe(3);
    expect(
      resolveDayStatus({ day: 1, currentDay: 3, completedAt: "x" }),
    ).toBe("done");
    expect(resolveDayStatus({ day: 2, currentDay: 3, completedAt: null })).toBe("missed");
    expect(resolveDayStatus({ day: 3, currentDay: 3, completedAt: null })).toBe("current");
    expect(resolveDayStatus({ day: 5, currentDay: 3, completedAt: null })).toBe("locked");
  });
});
