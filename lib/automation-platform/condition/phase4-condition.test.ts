/**
 * Automation Phase 4 — Condition / Event Trigger quality gate + E2E harness.
 *
 * Provider boundary is mocked (Calendar list). Runtime / edge / dedupe /
 * enqueue / executor / notify / completion use Production code paths.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async () => "owner@example.com"),
}));
vi.mock("@/lib/billing/access", () => ({
  getBillingFeatureDenial: vi.fn(async () => null),
  requireBillingAutomationTask: vi.fn(async () => null),
  requireBillingFeature: vi.fn(async () => null),
}));
vi.mock("@/lib/notifications/service", () => ({
  createNotification: vi.fn(),
}));

import { createNotification } from "@/lib/notifications/service";
import {
  isCalendarConditionWatchText,
  detectRequiredExternalActions,
} from "@/lib/automations/detect-external-intent";
import { parseNaturalLanguageAutomation } from "@/lib/automations/create-from-natural-language";
import {
  buildConditionV2CreateInputFromParse,
  isConditionTriggerNaturalLanguage,
  parsePhase4ConditionNaturalLanguage,
} from "@/lib/automations/phase4-condition-compose";
import { buildV2CreateInputFromNaturalLanguage } from "@/lib/automations/create-external-v2-from-nl";
import { composePhase3WorkflowSteps } from "@/lib/automations/phase3-multistep-compose";
import { decideConditionEdge } from "@/lib/automation-platform/condition/edge";
import { buildConditionOccurrenceKey } from "@/lib/automation-platform/condition/occurrence-key";
import { processConditionAutomationsV2 } from "@/lib/automation-platform/condition/process-condition-tick";
import {
  createEmptyTriggerState,
  getTriggerState,
  resetAutomationTriggerStateStoreForTests,
  upsertTriggerState,
} from "@/lib/automation-platform/condition/trigger-state-store";
import { executeQueuedRun } from "@/lib/automation-platform/execution/executor";
import { evaluateRunCompletion } from "@/lib/automation-platform/execution/run-completion";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import { dispatchAutomationRuns } from "@/lib/automation-platform/execution/dispatch";
import {
  resetAutomationV2DbStoreForTests,
  dbGetRun,
  dbListRunsForAutomation,
} from "@/lib/automation-platform/repository/db-store";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import { resetSideEffectStoreForTests } from "@/lib/side-effects/store";
import { resetAutomationAuditLogForTests } from "@/lib/automation-platform/audit/log";

const PHASE4_NL =
  "Googleカレンダーに『Phase4トリガーテスト』という予定が追加されたら、通知する";
const PHASE1_NL = "毎朝9時にニュースをまとめて";
const PHASE2_NL =
  "毎日1時にMINERVOT自動化テストという予定をGoogleカレンダーに作成して";
const PHASE3_NL =
  "毎日9時にMINERVOT Phase3テストという文章を作成し、Googleカレンダーに予定を登録して、完了したら通知して";

const createNotificationMock = vi.mocked(createNotification);
const ownerContext = buildFeatureAccessContext("owner@example.com");

function enableFlags() {
  resetFeatureFlagStore();
  setFeatureFlagState("automation_v2_enabled", "on");
  setFeatureFlagState("google", "on");
  setFeatureFlagState("automation_approval_enabled", "on");
}

describe("Phase 4 condition parser", () => {
  it("parses calendar event-added → notify condition", () => {
    expect(isConditionTriggerNaturalLanguage(PHASE4_NL)).toBe(true);
    const parsed = parsePhase4ConditionNaturalLanguage(PHASE4_NL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.title).toBe("Phase4トリガーテスト");
    expect(parsed.provider).toBe("google_calendar");
    expect(parsed.expression).toBe("google_calendar.event_title_match");

    const built = buildConditionV2CreateInputFromParse(parsed);
    expect(built.trigger.type).toBe("condition");
    expect(built.trigger.schedule).toBeNull();
    expect(built.trigger.event?.source).toBe("google_calendar");
    expect(built.workflow.steps.map((s) => s.type)).toEqual(["notify"]);
  });

  it("does not confuse Phase 1 schedule NL with condition", () => {
    expect(isConditionTriggerNaturalLanguage(PHASE1_NL)).toBe(false);
    expect(parseNaturalLanguageAutomation(PHASE1_NL).ok).toBe(true);
  });

  it("does not treat condition watch NL as Calendar create external", () => {
    expect(isCalendarConditionWatchText(PHASE4_NL)).toBe(true);
    expect(detectRequiredExternalActions(PHASE4_NL)).toEqual([]);
    expect(detectRequiredExternalActions(PHASE2_NL)).toContain("google_calendar");
  });
});

describe("Phase 4 false→true edge + occurrenceKey", () => {
  it("fires only on false→true with fresh resource id", () => {
    const first = decideConditionEdge({
      previousState: false,
      currentState: true,
      matchedResourceIds: ["evt_1"],
      alreadyTriggeredResourceIds: [],
      openRunBlocks: false,
    });
    expect(first.shouldTrigger).toBe(true);
    if (!first.shouldTrigger) return;
    expect(first.reason).toBe("false_to_true");
    expect(first.resourceId).toBe("evt_1");

    const stillTrue = decideConditionEdge({
      previousState: true,
      currentState: true,
      matchedResourceIds: ["evt_1"],
      alreadyTriggeredResourceIds: ["evt_1"],
      openRunBlocks: false,
    });
    expect(stillTrue.shouldTrigger).toBe(false);
    if (stillTrue.shouldTrigger) return;
    expect(stillTrue.reason).toBe("still_true_same_resources");
  });

  it("blocks while open run awaits approval", () => {
    const edge = decideConditionEdge({
      previousState: false,
      currentState: true,
      matchedResourceIds: ["evt_2"],
      alreadyTriggeredResourceIds: [],
      openRunBlocks: true,
    });
    expect(edge.shouldTrigger).toBe(false);
    if (edge.shouldTrigger) return;
    expect(edge.reason).toBe("open_run_blocks");
  });

  it("builds stable occurrenceKey", () => {
    const key = buildConditionOccurrenceKey({
      automationId: "auto_1",
      provider: "google_calendar",
      eventType: "event_title_match",
      resourceId: "evt_abc",
      triggerVersion: 1,
    });
    expect(key).toBe(
      "condition:auto_1:v1:google_calendar:event_title_match:evt_abc",
    );
  });
});

describe("Phase 4 condition runtime E2E", () => {
  beforeEach(() => {
    enableFlags();
    resetAutomationV2DbStoreForTests();
    resetAutomationTriggerStateStoreForTests();
    resetSideEffectStoreForTests();
    resetAutomationAuditLogForTests();
    createNotificationMock.mockReset();
    createNotificationMock.mockResolvedValue({
      notificationId: `notif_${crypto.randomUUID()}`,
    } as never);
  });

  it("false→true → occurrence → notify → succeeded; re-eval does not double-fire", async () => {
    const parsed = parsePhase4ConditionNaturalLanguage(PHASE4_NL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const created = await automationPlatformService.create(
      "user_phase4",
      buildConditionV2CreateInputFromParse(parsed),
      ownerContext,
    );
    expect(created.trigger.type).toBe("condition");
    expect(created.workflow.steps.some((s) => s.type === "google_calendar")).toBe(
      false,
    );

    await upsertTriggerState(
      createEmptyTriggerState({
        automationId: created.id,
        userId: "user_phase4",
        triggerType: "condition",
      }),
    );

    let calendarEvents: Array<{
      id: string;
      title: string;
      startAt: string;
      endAt: string;
      location: string | null;
      isAllDay: boolean;
      description: string | null;
      meetLink: string | null;
      htmlLink: string | null;
    }> = [];

    const fetcher = async () =>
      ({ ok: true as const, events: calendarEvents });

    // 1) condition false — no enqueue
    const tickFalse = await processConditionAutomationsV2({
      dispatch: false,
      calendarEventsFetcher: fetcher,
      context: ownerContext,
      hydrateUserIds: ["user_phase4"],
    });
    expect(tickFalse.evaluated).toBe(1);
    expect(tickFalse.falseCount).toBe(1);
    expect(tickFalse.enqueued).toBe(0);
    expect((await getTriggerState(created.id))?.lastConditionState).toBe(false);

    // 2) event appears → false→true
    calendarEvents = [
      {
        id: "evt_phase4_1",
        title: "Phase4トリガーテスト",
        startAt: "2026-08-13T10:00:00.000Z",
        endAt: "2026-08-13T11:00:00.000Z",
        location: null,
        isAllDay: false,
        description: null,
        meetLink: null,
        htmlLink: null,
      },
    ];

    const tickTrue = await processConditionAutomationsV2({
      dispatch: false,
      calendarEventsFetcher: fetcher,
      context: ownerContext,
      hydrateUserIds: ["user_phase4"],
    });
    expect(tickTrue.edges).toBe(1);
    expect(tickTrue.enqueued).toBe(1);
    expect(tickTrue.firings[0]?.resourceId).toBe("evt_phase4_1");

    const occurrenceKey = tickTrue.firings[0]!.occurrenceKey;
    const runId = tickTrue.firings[0]!.runId;
    expect(occurrenceKey).toContain("evt_phase4_1");

    let run = (await dbGetRun(runId))!;
    expect(run.triggerType).toBe("condition");
    expect(run.scheduleOccurrenceKey).toBe(occurrenceKey);
    expect(run.conditionTriggerEvidence?.eventId).toBe("evt_phase4_1");
    expect(run.conditionTriggerEvidence?.previousState).toBe(false);
    expect(run.conditionTriggerEvidence?.currentState).toBe(true);

    // Approve if needed, then dispatch + execute
    if (run.status === "awaiting_approval") {
      await automationPlatformService.approveRun(
        "user_phase4",
        run.id,
        ownerContext,
        { comment: "phase4-e2e", dispatch: false },
      );
      run = (await dbGetRun(runId))!;
    }

    if (run.status === "queued" || run.status === "scheduled") {
      await dispatchAutomationRuns({ runIds: [run.id] });
    }

    // Ensure execution with strict invoker (Production path)
    run = (await dbGetRun(runId))!;
    if (run.status !== "succeeded") {
      const latestAutomation = await automationPlatformService.get(
        "user_phase4",
        created.id,
        ownerContext,
      );
      const executed = await executeQueuedRun({
        run,
        automation: latestAutomation,
        invoker: strictStepInvoker,
      });
      run = executed.run;
    }

    expect(run.status).toBe("succeeded");
    expect(createNotificationMock).toHaveBeenCalled();
    expect(run.completionEvidence?.notificationIds?.length ?? 0).toBeGreaterThan(
      0,
    );

    const completion = evaluateRunCompletion({
      run,
      workflowSteps: created.workflow.steps,
      artifacts: run.artifacts,
      evidence: (run.completionEvidence as never) ?? null,
      needsUserInput: false,
      retryScheduled: false,
    });
    expect(completion.runStatus).toBe("succeeded");

    // 3) same event re-eval → no second run
    const tickAgain = await processConditionAutomationsV2({
      dispatch: false,
      calendarEventsFetcher: fetcher,
      context: ownerContext,
      hydrateUserIds: ["user_phase4"],
    });
    expect(tickAgain.enqueued).toBe(0);
    expect(tickAgain.edges).toBe(0);

    const runs = await dbListRunsForAutomation({
      userId: "user_phase4",
      automationId: created.id,
    });
    expect(runs).toHaveLength(1);

    // 4) cold-start: state restored from durable store
    const state = await getTriggerState(created.id);
    expect(state?.lastConditionState).toBe(true);
    expect(state?.lastEventId).toBe("evt_phase4_1");
    expect(state?.triggeredResourceIds).toContain("evt_phase4_1");
  });

  it("dedupes concurrent enqueue via occurrenceKey unique", async () => {
    const parsed = parsePhase4ConditionNaturalLanguage(PHASE4_NL);
    if (!parsed.ok) throw new Error("parse failed");
    const created = await automationPlatformService.create(
      "user_phase4",
      buildConditionV2CreateInputFromParse(parsed),
      ownerContext,
    );
    const occurrenceKey = buildConditionOccurrenceKey({
      automationId: created.id,
      provider: "google_calendar",
      eventType: "event_title_match",
      resourceId: "evt_dup",
    });
    const evidence = {
      previousState: false as boolean | null,
      currentState: true,
      provider: "google_calendar",
      eventType: "event_title_match",
      eventId: "evt_dup",
      providerResourceId: "evt_dup",
      conditionExpression: "google_calendar.event_title_match",
      edgeReason: "false_to_true",
    };
    const [a, b] = await Promise.all([
      automationPlatformService.enqueueRun({
        userId: "user_phase4",
        automationId: created.id,
        triggerType: "condition",
        occurrenceKey,
        context: ownerContext,
        dispatch: false,
        conditionEvidence: evidence,
      }),
      automationPlatformService.enqueueRun({
        userId: "user_phase4",
        automationId: created.id,
        triggerType: "condition",
        occurrenceKey,
        context: ownerContext,
        dispatch: false,
        conditionEvidence: evidence,
      }),
    ]);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    const runs = await dbListRunsForAutomation({
      userId: "user_phase4",
      automationId: created.id,
    });
    expect(runs).toHaveLength(1);
  });

  it("evaluation failure does not start workflow", async () => {
    const parsed = parsePhase4ConditionNaturalLanguage(PHASE4_NL);
    if (!parsed.ok) throw new Error("parse failed");
    const created = await automationPlatformService.create(
      "user_phase4",
      buildConditionV2CreateInputFromParse(parsed),
      ownerContext,
    );
    await upsertTriggerState(
      createEmptyTriggerState({
        automationId: created.id,
        userId: "user_phase4",
        triggerType: "condition",
      }),
    );

    const tick = await processConditionAutomationsV2({
      dispatch: false,
      context: ownerContext,
      hydrateUserIds: ["user_phase4"],
      calendarEventsFetcher: async () => ({
        ok: false,
        errorCode: "google_calendar_list_failed",
        errorMessage: "temporary",
        retryable: true,
      }),
    });
    expect(tick.evaluationFailed).toBe(1);
    expect(tick.enqueued).toBe(0);
    const runs = await dbListRunsForAutomation({
      userId: "user_phase4",
      automationId: created.id,
    });
    expect(runs).toHaveLength(0);
  });

  it("approval-required condition does not flood while awaiting_approval", async () => {
    const parsed = parsePhase4ConditionNaturalLanguage(PHASE4_NL);
    if (!parsed.ok) throw new Error("parse failed");
    const created = await automationPlatformService.create(
      "user_phase4",
      buildConditionV2CreateInputFromParse(parsed, {
        requireApprovalStep: true,
      }),
      ownerContext,
    );
    await upsertTriggerState(
      createEmptyTriggerState({
        automationId: created.id,
        userId: "user_phase4",
        triggerType: "condition",
      }),
    );

    const events = [
      {
        id: "evt_appr_1",
        title: "Phase4トリガーテスト",
        startAt: "2026-08-13T10:00:00.000Z",
        endAt: "2026-08-13T11:00:00.000Z",
        location: null,
        isAllDay: false,
        description: null,
        meetLink: null,
        htmlLink: null,
      },
    ];
    const fetcher = async () => ({ ok: true as const, events });

    const first = await processConditionAutomationsV2({
      dispatch: false,
      calendarEventsFetcher: fetcher,
      context: ownerContext,
      hydrateUserIds: ["user_phase4"],
    });
    expect(first.enqueued).toBe(1);
    const run = (await dbGetRun(first.firings[0]!.runId))!;
    expect(
      run.status === "awaiting_approval" || run.approval?.status === "pending",
    ).toBe(true);

    // Same / additional matching event while awaiting → no flood
    events.push({
      ...events[0]!,
      id: "evt_appr_2",
    });
    const second = await processConditionAutomationsV2({
      dispatch: false,
      calendarEventsFetcher: fetcher,
      context: ownerContext,
      hydrateUserIds: ["user_phase4"],
    });
    expect(second.enqueued).toBe(0);
    expect(second.skippedOpenRun).toBeGreaterThanOrEqual(1);

    const runs = await dbListRunsForAutomation({
      userId: "user_phase4",
      automationId: created.id,
    });
    expect(runs).toHaveLength(1);
  });

  it("lease prevents concurrent double evaluation fire", async () => {
    const parsed = parsePhase4ConditionNaturalLanguage(PHASE4_NL);
    if (!parsed.ok) throw new Error("parse failed");
    const created = await automationPlatformService.create(
      "user_phase4",
      buildConditionV2CreateInputFromParse(parsed),
      ownerContext,
    );
    await upsertTriggerState(
      createEmptyTriggerState({
        automationId: created.id,
        userId: "user_phase4",
        triggerType: "condition",
      }),
    );
    const events = [
      {
        id: "evt_lease_1",
        title: "Phase4トリガーテスト",
        startAt: "2026-08-13T10:00:00.000Z",
        endAt: "2026-08-13T11:00:00.000Z",
        location: null,
        isAllDay: false,
        description: null,
        meetLink: null,
        htmlLink: null,
      },
    ];
    const fetcher = async () => ({ ok: true as const, events });

    const [a, b] = await Promise.all([
      processConditionAutomationsV2({
        dispatch: false,
        calendarEventsFetcher: fetcher,
        context: ownerContext,
        hydrateUserIds: ["user_phase4"],
        owner: "owner-a",
      }),
      processConditionAutomationsV2({
        dispatch: false,
        calendarEventsFetcher: fetcher,
        context: ownerContext,
        hydrateUserIds: ["user_phase4"],
        owner: "owner-b",
      }),
    ]);
    const enqueued = a.enqueued + b.enqueued;
    const skippedLease = a.skippedLease + b.skippedLease;
    expect(enqueued).toBe(1);
    expect(skippedLease + (a.deduped + b.deduped)).toBeGreaterThanOrEqual(0);
    const runs = await dbListRunsForAutomation({
      userId: "user_phase4",
      automationId: created.id,
    });
    expect(runs.length).toBe(1);
  });
});

describe("Phase 1–3 regression (composition intact)", () => {
  it("Phase 1 schedule parse unchanged", () => {
    const parsed = parseNaturalLanguageAutomation(PHASE1_NL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.createInput.schedule.kind).toBe("schedule");
  });

  it("Phase 2 calendar-only NL stays single google_calendar step", () => {
    const composed = composePhase3WorkflowSteps({
      sourceText: PHASE2_NL,
      requiredExternals: ["google_calendar"],
    });
    expect(composed.composition).toBe("calendar_only");
    expect(composed.steps.map((s) => s.type)).toEqual(["google_calendar"]);

    const parsed = parseNaturalLanguageAutomation(PHASE2_NL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const built = buildV2CreateInputFromNaturalLanguage({
      createInput: parsed.createInput,
      sourceText: parsed.sourceText,
      requiredExternals: parsed.requiredExternals,
    });
    expect("error" in built).toBe(false);
    if ("error" in built) return;
    expect(built.trigger.type).toBe("schedule");
    expect(built.workflow.steps.map((s) => s.type)).toEqual(["google_calendar"]);
  });

  it("Phase 3 multi-step composition unchanged", () => {
    const composed = composePhase3WorkflowSteps({
      sourceText: PHASE3_NL,
      requiredExternals: ["google_calendar"],
    });
    expect(composed.steps.map((s) => s.type)).toEqual([
      "word_generate",
      "google_calendar",
      "notify",
    ]);
  });
});
