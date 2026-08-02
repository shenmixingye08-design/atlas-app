import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createAutomationV2 = vi.fn();
const runAutomationV2 = vi.fn();
const fetchAutomationRun = vi.fn();
const fetchAutomationsV2 = vi.fn();

vi.mock("@/lib/automation-platform/client", () => ({
  createAutomationV2: (...args: unknown[]) => createAutomationV2(...args),
  runAutomationV2: (...args: unknown[]) => runAutomationV2(...args),
  fetchAutomationRun: (...args: unknown[]) => fetchAutomationRun(...args),
  fetchAutomationsV2: (...args: unknown[]) => fetchAutomationsV2(...args),
}));

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
vi.stubGlobal("window", { localStorage: localStorageMock });

import {
  buildWeeklyReportCreateInput,
  listActivationEventsForTests,
  loadActivationState,
  markActivationSkipped,
  resetActivationAnalyticsForTests,
  resetActivationStateForTests,
  runWeeklyReportActivation,
  shouldAutoOpenActivation,
  shouldOfferActivationCta,
  trackActivationEvent,
  WEEKLY_REPORT_DEFAULTS,
  WEEKLY_REPORT_TEMPLATE_ID,
} from "@/lib/activation";
import { completeOnboarding, resetOnboardingForRedo } from "@/lib/onboarding";
import { resetUserWorkProfile } from "@/lib/user-profile";

describe("activation weekly report template", () => {
  it("builds active weekly Word automation without external steps", () => {
    const input = buildWeeklyReportCreateInput(WEEKLY_REPORT_DEFAULTS);
    expect(input.name).toBe("毎週の営業レポート");
    expect(input.status).toBe("active");
    expect(input.trigger.type).toBe("schedule");
    expect(input.trigger.schedule?.frequency).toBe("weekly");
    expect(input.workflow.steps).toHaveLength(1);
    expect(input.workflow.steps[0]?.type).toBe("word_generate");
    expect(
      input.workflow.steps.every(
        (step) =>
          step.type !== "gmail" &&
          step.type !== "x_post" &&
          step.type !== "dropbox",
      ),
    ).toBe(true);
    expect(input.executionPolicy?.mode).toBe("run_then_notify");
    expect(input.notificationPolicy?.onSuccess).toBe(true);
  });
});

describe("activation store + analytics", () => {
  beforeEach(() => {
    storage.clear();
    resetUserWorkProfile();
    resetActivationStateForTests();
    resetActivationAnalyticsForTests();
    resetOnboardingForRedo();
  });

  afterEach(() => {
    resetActivationStateForTests();
    resetActivationAnalyticsForTests();
  });

  it("auto-opens after onboarding until completed or skipped", () => {
    expect(shouldAutoOpenActivation()).toBe(false);
    completeOnboarding({
      preferredTasks: ["sales_material"],
      entryMode: "guide",
    });
    expect(shouldAutoOpenActivation()).toBe(true);
    expect(shouldOfferActivationCta()).toBe(true);
    markActivationSkipped();
    expect(shouldAutoOpenActivation()).toBe(false);
    expect(shouldOfferActivationCta()).toBe(true);
  });

  it("never includes content notes in analytics payload", () => {
    trackActivationEvent("template_selected", {
      templateId: WEEKLY_REPORT_TEMPLATE_ID,
      contentNotes: "秘密の商談内容",
      notes: "秘密",
    });
    const events = listActivationEventsForTests();
    expect(events[0]?.payload.contentNotes).toBeUndefined();
    expect(events[0]?.payload.notes).toBeUndefined();
    expect(events[0]?.payload.templateId).toBe(WEEKLY_REPORT_TEMPLATE_ID);
  });
});

describe("runWeeklyReportActivation", () => {
  beforeEach(() => {
    resetActivationStateForTests();
    resetActivationAnalyticsForTests();
    createAutomationV2.mockReset();
    runAutomationV2.mockReset();
    fetchAutomationRun.mockReset();
    fetchAutomationsV2.mockReset();
  });

  it("creates automation, runs test, requires real deliverable URL", async () => {
    createAutomationV2.mockResolvedValue({ id: "auto_act_1" });
    runAutomationV2.mockResolvedValue({
      created: true,
      run: {
        id: "run_act_1",
        status: "succeeded",
        diagnosticId: "diag_1",
        artifacts: [
          {
            id: "a1",
            kind: "deliverable",
            label: "週次営業報告書.docx",
            url: "http://localhost:3000/api/deliverables/dlv_act_1",
            externalId: "dlv_act_1",
            createdAt: new Date().toISOString(),
          },
        ],
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        needsUserInput: false,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });

    const outcome = await runWeeklyReportActivation({
      config: WEEKLY_REPORT_DEFAULTS,
      idempotencyKey: "activation:test:1",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.downloadUrl).toContain("/api/deliverables/");
    expect(outcome.result.fileName).toContain("docx");
    expect(loadActivationState().completedAt).toBeTruthy();
    expect(createAutomationV2).toHaveBeenCalledOnce();
    expect(runAutomationV2).toHaveBeenCalledWith(
      "auto_act_1",
      "activation:test:1",
    );

    const names = listActivationEventsForTests().map((event) => event.name);
    expect(names).toContain("automation_draft_created");
    expect(names).toContain("first_test_run_started");
    expect(names).toContain("first_artifact_created");
    expect(names).toContain("first_experience_completed");
  });

  it("fails closed when artifact url is missing (no fake success)", async () => {
    createAutomationV2.mockResolvedValue({ id: "auto_act_2" });
    runAutomationV2.mockResolvedValue({
      created: true,
      run: {
        id: "run_act_2",
        status: "succeeded",
        diagnosticId: "diag_2",
        artifacts: [
          {
            id: "a2",
            kind: "deliverable",
            label: "空",
            url: null,
            externalId: null,
            createdAt: new Date().toISOString(),
          },
        ],
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        needsUserInput: false,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });

    const outcome = await runWeeklyReportActivation({
      config: WEEKLY_REPORT_DEFAULTS,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.stage).toBe("deliverable");
    expect(loadActivationState().completedAt).toBeNull();
  });

  it("reuses existing automation id on retry to avoid duplicates", async () => {
    runAutomationV2.mockResolvedValue({
      created: true,
      run: {
        id: "run_act_3",
        status: "succeeded",
        diagnosticId: "diag_3",
        artifacts: [
          {
            id: "a3",
            kind: "deliverable",
            label: "週次営業報告書.docx",
            url: "http://localhost:3000/api/deliverables/dlv_act_3",
            externalId: "dlv_act_3",
            createdAt: new Date().toISOString(),
          },
        ],
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        needsUserInput: false,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });

    const outcome = await runWeeklyReportActivation({
      config: WEEKLY_REPORT_DEFAULTS,
      existingAutomationId: "auto_existing",
      idempotencyKey: "activation:retry:1",
    });
    expect(outcome.ok).toBe(true);
    expect(createAutomationV2).not.toHaveBeenCalled();
    expect(runAutomationV2).toHaveBeenCalledWith(
      "auto_existing",
      "activation:retry:1",
    );
  });

  it("surfaces create failures with retryable info", async () => {
    createAutomationV2.mockRejectedValue(new Error("作成に失敗しました"));
    const outcome = await runWeeklyReportActivation({
      config: WEEKLY_REPORT_DEFAULTS,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.stage).toBe("create");
    expect(outcome.failure.retryable).toBe(true);
    expect(outcome.failure.message).toContain("作成");
  });
});
