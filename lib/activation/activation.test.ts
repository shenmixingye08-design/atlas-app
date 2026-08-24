import { beforeEach, describe, expect, it } from "vitest";

import { buildActivationChecklist } from "./checklist";
import { activationEmptyCopy } from "./empty-copy";
import { isQualifyingFirstSuccess, requestCompletedIsActivation } from "./first-success";
import { buildActivationFunnel } from "./funnel";
import { listAvailableGoals, getRecommendedGoalId } from "./goals";
import { classifyOAuthFailure } from "./oauth-errors";
import { resolveActivationPaywall } from "./paywall-policy";
import { stripForbiddenFields, toSafeEventPayload } from "./privacy";
import {
  getOrCreateActivationProgress,
  recordActivationEvent,
  updateActivationProgress,
} from "./service";
import { resetActivationStoreForTests } from "./store";
import { resolveTrialPolicy } from "./trial-policy";
import { createDefaultProgress } from "./service";
import { incrementUsageCounter } from "@/lib/billing/usage/store";

describe("activation first success", () => {
  it("does not treat completed-without-artifact as activation", () => {
    expect(
      requestCompletedIsActivation({
        status: "completed",
        deliverableId: null,
        viewed: true,
      }),
    ).toBe(false);
  });

  it("requires a real viewed artifact", () => {
    expect(
      requestCompletedIsActivation({
        status: "completed",
        deliverableId: "del_1",
        viewed: false,
      }),
    ).toBe(false);
    expect(
      requestCompletedIsActivation({
        status: "completed",
        deliverableId: "del_1",
        viewed: true,
      }),
    ).toBe(true);
  });

  it("rejects mock and sandbox success", () => {
    expect(
      isQualifyingFirstSuccess({
        kind: "request_completed_viewed",
        hasRealArtifact: true,
        sideEffectConfirmed: true,
        mock: true,
        sandbox: false,
        viewed: true,
      }),
    ).toBe(false);
  });
});

describe("activation privacy", () => {
  it("strips prompts tokens and payment fields", () => {
    const cleaned = stripForbiddenFields({
      prompt: "secret text",
      token: "sk-live",
      event: "first_request_submitted",
      diagnosticId: "d1",
    });
    expect(cleaned.prompt).toBeUndefined();
    expect(cleaned.token).toBeUndefined();
    expect(cleaned.diagnosticId).toBe("d1");
  });

  it("does not store long or secret-looking values", () => {
    const event = toSafeEventPayload({
      event: "first_request_submitted",
      userId: "user_a",
      idempotencyKey: "k1",
      sourcePage: "Bearer abc.def",
    });
    expect(event.sourcePage).toBeNull();
  });
});

describe("activation events", () => {
  beforeEach(() => {
    resetActivationStoreForTests();
  });

  it("records first success only when viewed", async () => {
    await recordActivationEvent({
      userId: "user_new",
      event: "first_request_completed",
      idempotencyKey: "c1",
      success: true,
    });
    const afterComplete = await getOrCreateActivationProgress("user_new");
    expect(afterComplete.milestones.firstSuccessAt).toBeUndefined();

    await recordActivationEvent({
      userId: "user_new",
      event: "first_result_viewed",
      idempotencyKey: "v1",
      success: true,
    });
    const afterView = await getOrCreateActivationProgress("user_new");
    expect(afterView.milestones.firstSuccessAt).toBeTruthy();
    expect(afterView.phase).toBe("completed");
  });

  it("is idempotent for the same success", async () => {
    const first = await recordActivationEvent({
      userId: "user_idemp",
      event: "first_x_draft_created",
      idempotencyKey: "draft:1",
    });
    const second = await recordActivationEvent({
      userId: "user_idemp",
      event: "first_x_draft_created",
      idempotencyKey: "draft:1",
    });
    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
  });

  it("does not give one user another user's progress", async () => {
    await recordActivationEvent({
      userId: "user_a",
      event: "goal_selected",
      idempotencyKey: "g-a",
      selectedGoal: "x_draft",
    });
    const other = await getOrCreateActivationProgress("user_b");
    expect(other.selectedGoal).toBeNull();
    expect(other.milestones.goal_selected).toBeUndefined();
  });

  it("resumes draft inputs after leaving", async () => {
    await updateActivationProgress("user_resume", {
      selectedGoal: "x_draft",
      draftInputs: { theme: "採用", tone: "短く" },
      phase: "in_progress",
    });
    const next = await getOrCreateActivationProgress("user_resume");
    expect(next.draftInputs.theme).toBe("採用");
    expect(next.selectedGoal).toBe("x_draft");
  });

  it("treats existing usage as legacy and does not force onboarding", async () => {
    incrementUsageCounter("user_old", "aiRuns", 2);
    const progress = await getOrCreateActivationProgress("user_old");
    expect(progress.legacyUser).toBe(true);
    expect(progress.phase).toBe("completed");
  });
});

describe("activation goals and checklist", () => {
  it("does not offer unimplemented batch create", () => {
    expect(listAvailableGoals().some((goal) => goal.id.includes("batch"))).toBe(
      false,
    );
    expect(getRecommendedGoalId("free")).toBe("x_draft");
  });

  it("shows only the selected goal's next actions", () => {
    const progress = createDefaultProgress("u", "free");
    progress.selectedGoal = "x_draft";
    progress.phase = "in_progress";
    const items = buildActivationChecklist(progress);
    expect(items.some((item) => item.id === "create_automation")).toBe(false);
    expect(items.some((item) => item.id === "first_request")).toBe(true);
  });

  it("hides calendar for Free and keeps it for Standard", () => {
    expect(listAvailableGoals("free").some((goal) => goal.id === "calendar")).toBe(
      false,
    );
    expect(
      listAvailableGoals("standard").some((goal) => goal.id === "calendar"),
    ).toBe(true);
  });
});

describe("activation paywall and trial", () => {
  it("does not show a paywall at signup", () => {
    const view = resolveActivationPaywall({
      planId: "free",
      reason: null,
      firstSuccess: false,
      paid: false,
    });
    expect(view.show).toBe(false);
  });

  it("uses catalog prices after first success", () => {
    const view = resolveActivationPaywall({
      planId: "free",
      reason: "after_first_success",
      firstSuccess: true,
      paid: false,
    });
    expect(view.show).toBe(true);
    expect(view.currentPriceJpy).toBe(0);
    expect(view.targetPriceJpy).toBe(980);
  });

  it("hides paywall for paid users and free-limit uses catalog", () => {
    expect(
      resolveActivationPaywall({
        planId: "light",
        reason: "after_first_success",
        firstSuccess: true,
        paid: true,
      }).show,
    ).toBe(false);
    const limited = resolveActivationPaywall({
      planId: "free",
      reason: "free_limit",
      firstSuccess: true,
      paid: false,
    });
    expect(limited.show).toBe(true);
    expect(limited.targetPlan).toBe("light");
  });

  it("keeps production trial on single_success", () => {
    const policy = resolveTrialPolicy({
      ...process.env,
      ATLAS_TRIAL_POLICY: "fixed_days",
      VERCEL_ENV: "production",
      NODE_ENV: "production",
    });
    expect(policy.mode).toBe("single_success");
    expect(policy.appliedInProduction).toBe(false);
  });
});

describe("oauth classification", () => {
  it("classifies user cancel and token persist failure", () => {
    expect(classifyOAuthFailure({ providerError: "access_denied" })).toBe(
      "user_cancelled",
    );
    expect(
      classifyOAuthFailure({ hasCode: true, hasState: true, tokenSaved: false }),
    ).toBe("token_persist_failed");
  });

  it("classifies scope, provider, and misconfiguration", () => {
    expect(classifyOAuthFailure({ providerError: "invalid_scope" })).toBe(
      "insufficient_scope",
    );
    expect(
      classifyOAuthFailure({
        providerError: "temporarily_unavailable",
        hasCode: true,
        hasState: true,
      }),
    ).toBe("provider_error");
    expect(classifyOAuthFailure({ configured: false })).toBe("misconfigured");
    expect(classifyOAuthFailure({ callbackException: true, hasCode: true })).toBe(
      "callback_failed",
    );
  });
});

describe("empty states and funnel", () => {
  it("gives every empty surface a primary action", () => {
    for (const surface of [
      "requests",
      "automations",
      "deliverables",
      "memory",
      "x_posts",
      "integrations",
      "notifications",
    ] as const) {
      const copy = activationEmptyCopy(surface);
      expect(copy.primaryHref.length).toBeGreaterThan(1);
      expect(copy.primaryLabel.length).toBeGreaterThan(1);
    }
  });

  it("computes rates without inventing causality", () => {
    const funnel = buildActivationFunnel(
      [
        {
          event: "sign_up_completed",
          userId: "a",
          occurredAt: "2026-08-01T00:00:00.000Z",
          sourcePage: "/projects",
          selectedGoal: null,
          jobType: null,
          success: true,
          diagnosticId: null,
          plan: "free",
          deviceCategory: "mobile",
          appVersion: null,
          idempotencyKey: "s",
        },
        {
          event: "first_request_submitted",
          userId: "a",
          occurredAt: "2026-08-01T00:10:00.000Z",
          sourcePage: "/workspace",
          selectedGoal: "x_draft",
          jobType: "work_request",
          success: true,
          diagnosticId: null,
          plan: "free",
          deviceCategory: "mobile",
          appVersion: null,
          idempotencyKey: "r",
        },
      ],
      { from: "2026-08-01T00:00:00.000Z", to: "2026-08-31T00:00:00.000Z" },
    );
    expect(funnel.registered).toBe(1);
    expect(funnel.firstRequestSubmittedRate).toBe(1);
    expect(funnel.note).toContain("因果");
  });
});
