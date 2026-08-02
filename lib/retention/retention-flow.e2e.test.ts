/**
 * Retention E2E (unit-level flow): signup wizard → Quick Win path →
 * Day1 success → survey → home bootstrap → notifications hygiene.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isActivationCompleted,
  markActivationCompleted,
  resetActivationStateForTests,
  shouldAutoOpenActivation,
} from "@/lib/activation/store";
import { completeOnboarding, shouldShowWelcomeWizard } from "@/lib/onboarding";
import { resetUserWorkProfile } from "@/lib/user-profile";

import {
  applySurveyToRetention,
  buildHomeBootstrapItems,
  buildNextAutomateSuggestions,
  buildRetentionValueStats,
  completeRetentionWizard,
  emitRetentionNotification,
  loadRetentionState,
  markRetentionDayComplete,
  recordFirstWinDeliverable,
  recordRetentionActivity,
  resetRetentionAnalyticsForTests,
  resetRetentionStateForTests,
  shouldShowRetentionSurvey,
} from "@/lib/retention";

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

describe("retention 15-min first-win E2E flow", () => {
  it("new registration → wizard → quick win → day plan → survey → home", () => {
    expect(shouldShowWelcomeWizard()).toBe(true);

    const wizard = completeRetentionWizard({
      workDescription: "毎週の営業報告",
      company: "Atlas Sales",
      roleId: "sales",
      preferredTasks: ["sales_material", "email"],
      integrations: ["google", "email", "calendar"],
      entryMode: "guide",
    });

    expect(shouldShowWelcomeWizard()).toBe(false);
    expect(wizard.quickWinHref).toBe("/activation/weekly-report");
    expect(shouldAutoOpenActivation()).toBe(true);

    // Simulate real artifact receive (activation runner).
    markActivationCompleted({
      automationId: "auto-1",
      runId: "run-1",
      artifactUrl: "/api/artifacts/demo.docx",
    });
    recordFirstWinDeliverable("/projects/auto-1");

    expect(isActivationCompleted()).toBe(true);
    expect(loadRetentionState().dayPlan[0]?.completedAt).toBeTruthy();
    expect(shouldShowRetentionSurvey(loadRetentionState(), true)).toBe(true);

    applySurveyToRetention({
      helpful: "yes",
      revision: "none",
      reuse: "yes",
    });
    expect(loadRetentionState().survey?.reuse).toBe("yes");

    markRetentionDayComplete(3);
    recordRetentionActivity();

    const bootstrap = buildHomeBootstrapItems();
    expect(bootstrap.length).toBeGreaterThanOrEqual(3);
    expect(bootstrap.every((item) => item.href.length > 0)).toBe(true);

    const suggestions = buildNextAutomateSuggestions({ automations: [] });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);

    const stats = buildRetentionValueStats();
    expect(stats.deliverableCount).toBeGreaterThanOrEqual(1);
    expect(stats.secretaryLevel).toBeGreaterThanOrEqual(1);

    const n1 = emitRetentionNotification("deliverable", {
      title: "成果物",
      message: "完了",
      href: "/projects/auto-1",
    });
    // Already emitted by recordFirstWinDeliverable — same-day throttle.
    expect(n1).toBeNull();

    const n2 = emitRetentionNotification("suggestion", {
      title: "提案",
      message: "次",
      href: "/automations/new",
    });
    expect(n2).not.toBeNull();
  });

  it("forbids empty home bootstrap and setup-only ending", () => {
    completeRetentionWizard({
      workDescription: "",
      company: "",
      roleId: "other",
      preferredTasks: [],
      integrations: [],
      entryMode: "skip",
    });
    // Skip still seeds a Quick Win path — never settings-only.
    expect(shouldAutoOpenActivation()).toBe(true);
    const items = buildHomeBootstrapItems();
    expect(items.some((i) => i.kind === "quick_deliverable")).toBe(true);
    expect(items.every((i) => i.ctaLabel.length > 0)).toBe(true);
  });

  it("does not reopen wizard after onboarding complete without reset", () => {
    completeOnboarding({ preferredTasks: ["sns"], entryMode: "guide" });
    expect(shouldShowWelcomeWizard()).toBe(false);
  });
});
