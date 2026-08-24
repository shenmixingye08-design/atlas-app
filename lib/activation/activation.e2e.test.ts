import { beforeEach, describe, expect, it } from "vitest";

import {
  getActivationView,
  getOrCreateActivationProgress,
  recordActivationEvent,
  updateActivationProgress,
} from "./service";
import { resetActivationStoreForTests } from "./store";
import { buildActivationFunnel } from "./funnel";
import { listUserActivationEvents } from "./service";

describe("activation flow e2e", () => {
  beforeEach(() => {
    resetActivationStoreForTests();
  });

  it("walks new user from goal to viewed result without paying", async () => {
    const userId = "e2e_new";
    const created = await getOrCreateActivationProgress(userId);
    expect(created.phase).toBe("new_signup");
    expect(created.legacyUser).toBe(false);

    await recordActivationEvent({
      userId,
      event: "onboarding_started",
      idempotencyKey: "start",
    });
    await updateActivationProgress(userId, {
      selectedGoal: "x_draft",
      draftInputs: { theme: "採用" },
      phase: "in_progress",
    });
    await recordActivationEvent({
      userId,
      event: "first_request_submitted",
      idempotencyKey: "job1",
    });
    await recordActivationEvent({
      userId,
      event: "first_request_completed",
      idempotencyKey: "done1",
    });
    await recordActivationEvent({
      userId,
      event: "first_result_viewed",
      idempotencyKey: "view1",
    });

    const progress = await getOrCreateActivationProgress(userId);
    expect(progress.milestones.firstSuccessAt).toBeTruthy();
    expect(progress.phase).toBe("completed");

    const events = listUserActivationEvents(userId);
    expect(events.some((event) => "prompt" in event)).toBe(false);
    expect(events.every((event) => event.userId === userId)).toBe(true);

    const funnel = buildActivationFunnel(events, {
      from: "2020-01-01T00:00:00.000Z",
      to: "2030-01-01T00:00:00.000Z",
    });
    expect(funnel.paidRate).toBe(0);
    expect(funnel.firstResultViewedRate).toBe(1);
  });

  it("does not reopen onboarding for skipped users", async () => {
    await recordActivationEvent({
      userId: "e2e_skip",
      event: "onboarding_skipped",
      idempotencyKey: "skip",
    });
    const progress = await getOrCreateActivationProgress("e2e_skip");
    expect(progress.phase).toBe("skipped");
    const view = await getActivationView("e2e_skip");
    expect(view.shouldShowOnboarding).toBe(false);
  });

  it("lets a user change goal and resume draft inputs", async () => {
    await updateActivationProgress("e2e_goal", {
      selectedGoal: "document",
      draftInputs: { assignment: "週次報告" },
      phase: "in_progress",
    });
    await updateActivationProgress("e2e_goal", {
      selectedGoal: "x_draft",
      draftInputs: { theme: "採用" },
    });
    const view = await getActivationView("e2e_goal");
    expect(view.progress.selectedGoal).toBe("x_draft");
    expect(view.progress.draftInputs.theme).toBe("採用");
    expect(view.shouldShowOnboarding).toBe(false);
    expect(view.shouldShowResume).toBe(true);
  });

  it("treats automation run success as first success", async () => {
    await recordActivationEvent({
      userId: "e2e_auto",
      event: "first_automation_created",
      idempotencyKey: "auto-create",
    });
    const before = await getOrCreateActivationProgress("e2e_auto");
    expect(before.milestones.firstSuccessAt).toBeUndefined();
    await recordActivationEvent({
      userId: "e2e_auto",
      event: "first_automation_run_completed",
      idempotencyKey: "auto-run",
    });
    const after = await getOrCreateActivationProgress("e2e_auto");
    expect(after.milestones.firstSuccessAt).toBeTruthy();
    expect(after.milestones.firstSuccessKind).toBe("automation_run_succeeded");
  });
});
