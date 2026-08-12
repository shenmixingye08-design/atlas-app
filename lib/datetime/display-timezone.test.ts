/**
 * JST / UTC display regression — 「今日の仕事」15h skew.
 *
 * Root cause: UTC ISO (correct) was formatted with host TZ (UTC on server)
 * via toLocaleTimeString without timeZone → 01:00 JST shown as 16:00.
 */

import { describe, expect, it } from "vitest";

import { computeNextRunIso } from "@/lib/automations/schedule";
import { parseNaturalLanguageAutomation } from "@/lib/automations/create-from-natural-language";
import { buildAutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import type { AutomationRun } from "@/lib/automation-platform/types/run";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import {
  endOfDayInTimeZone,
  formatTimeInUserTimeZone,
  isInstantInZonedDay,
  startOfDayInTimeZone,
} from "./display-timezone";

/** Asia/Tokyo 2026-08-13 01:35 == UTC 2026-08-12 16:35 */
const NOW_0135_JST = new Date("2026-08-12T16:35:00.000Z");

function sampleAutomation(
  partial: Partial<AutomationV2> & Pick<AutomationV2, "id" | "name">,
): AutomationV2 {
  return {
    userId: "user_tz",
    description: "",
    status: "active",
    legacyAutomationId: null,
    trigger: {
      type: "schedule",
      timezone: "Asia/Tokyo",
      schedule: {
        frequency: "daily",
        hour: 1,
        minute: 0,
        cronDerived: null,
        startAt: null,
        endAt: null,
        maxOccurrences: null,
      },
      event: null,
      condition: null,
    },
    workflow: {
      version: 1,
      steps: [],
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 60_000,
        stepDefaultTimeoutMs: 10_000,
      },
    },
    executionPolicy: {
      mode: "review_before_run",
      approvalTimeoutMs: null,
      onApprovalTimeout: "cancel",
      selectedStepIds: [],
      systemHighRiskOverride: true,
    },
    notificationPolicy: {
      beforeRun: false,
      onSuccess: true,
      onFailure: true,
      onNeedsInput: true,
      channels: ["in_app"],
    },
    instruction: { freeformNotes: "", structuredOptions: {} },
    memoryPolicy: {
      enabled: false,
      allowedScopes: [],
      deniedScopes: [],
      lockedOverrides: {},
    },
    nextRunAt: null,
    lastRunAt: null,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    ...partial,
  } as AutomationV2;
}

function sampleRun(partial: Partial<AutomationRun>): AutomationRun {
  const now = "2026-08-12T16:35:00.000Z";
  return {
    id: "run_tz",
    automationId: "auto_tz",
    automationName: "時刻テスト",
    userId: "user_tz",
    status: "succeeded",
    runKey: "rk",
    idempotencyKey: "ik",
    scheduleOccurrenceKey: null,
    triggerType: "schedule",
    scheduledFor: "2026-08-12T16:00:00.000Z",
    queuedAt: now,
    startedAt: "2026-08-12T16:03:00.000Z",
    completedAt: "2026-08-12T16:31:00.000Z",
    durationMs: 1000,
    attemptCount: 1,
    maxAttempts: 3,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    failedStepId: null,
    retryable: false,
    needsUserInput: false,
    resolvedInstruction: null,
    memoryUsage: { used: [], updated: [], unusedScopes: [] },
    memoryReferences: [],
    statusHistory: [],
    steps: [],
    artifacts: [],
    approval: null,
    preparation: null,
    completionEvidence: null,
    resultSummary: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  } as AutomationRun;
}

describe("display timezone — Cases A–D", () => {
  it("Case A: at 01:35 JST, UI shows 01:xx not 16:xx", () => {
    // Host is UTC in CI — without timeZone this would wrongly show 16:35.
    expect(formatTimeInUserTimeZone("2026-08-12T16:35:00.000Z")).toMatch(
      /^01:35$/,
    );
    expect(formatTimeInUserTimeZone("2026-08-12T16:00:00.000Z")).toMatch(
      /^01:00$/,
    );
    expect(formatTimeInUserTimeZone("2026-08-12T16:03:00.000Z")).toMatch(
      /^01:03$/,
    );
    expect(formatTimeInUserTimeZone("2026-08-12T16:31:00.000Z")).toMatch(
      /^01:31$/,
    );

    const summary = buildAutomationOperationsSummary({
      automations: [
        sampleAutomation({
          id: "auto_upcoming",
          name: "カレンダー入力自動化テスト",
          // Next daily 01:00 JST after 01:35 → Aug 14 01:00 JST = Aug 13 16:00Z
          // Also include a same-day completed run at 01:31 JST.
          nextRunAt: "2026-08-13T16:00:00.000Z",
        }),
      ],
      runs: [
        sampleRun({
          id: "run_done",
          completedAt: "2026-08-12T16:31:00.000Z",
          startedAt: "2026-08-12T16:03:00.000Z",
          scheduledFor: "2026-08-12T16:00:00.000Z",
        }),
      ],
      now: NOW_0135_JST,
      timeZone: "Asia/Tokyo",
    });

    const labels = summary.todayWork.map((item) => item.timeLabel);
    expect(labels.some((label) => label.includes("16:"))).toBe(false);
    expect(labels).toContain("01:31");
  });

  it("Case B: 毎日1時 → Asia/Tokyo 01:00 nextRun; scheduler due at that instant", () => {
    const parsed = parseNaturalLanguageAutomation(
      "毎日1時にMINERVOT自動化テストという予定をGoogleカレンダーに作成して",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.createInput.schedule.kind).toBe("schedule");
    if (parsed.createInput.schedule.kind !== "schedule") return;
    expect(parsed.createInput.schedule.timezone).toBe("Asia/Tokyo");
    if (parsed.createInput.schedule.preset.type === "daily") {
      expect(parsed.createInput.schedule.preset.hour).toBe(1);
      expect(parsed.createInput.schedule.preset.minute).toBe(0);
    }

    // From 2026-08-12 00:00 JST, next 01:00 JST is same day → UTC 2026-08-11T16:00:00.000Z
    // From 01:35 JST, next is tomorrow 01:00 JST.
    const nextIso = computeNextRunIso(
      parsed.createInput.schedule,
      NOW_0135_JST,
    );
    expect(nextIso).toBe("2026-08-13T16:00:00.000Z");
    // Meaning: Asia/Tokyo 2026-08-14 01:00
    expect(formatTimeInUserTimeZone(nextIso)).toBe("01:00");

    const dueAt = new Date(nextIso!);
    expect(dueAt.getTime()).toBe(Date.parse("2026-08-13T16:00:00.000Z"));
    // One ms before → not due; at/after → due (UTC instant compare)
    expect(dueAt.getTime() <= Date.parse("2026-08-13T15:59:59.999Z")).toBe(
      false,
    );
    expect(dueAt.getTime() <= Date.parse("2026-08-13T16:00:00.000Z")).toBe(
      true,
    );
  });

  it("Case C: UTC-stored run timestamp displays with one Tokyo conversion", () => {
    const utcStored = "2026-08-12T16:31:00.000Z";
    expect(formatTimeInUserTimeZone(utcStored)).toBe("01:31");
    // Single conversion only — never treat the display string as a new UTC instant
    expect(formatTimeInUserTimeZone(utcStored)).toBe(
      formatTimeInUserTimeZone(utcStored),
    );
    expect(formatTimeInUserTimeZone(utcStored)).not.toBe("16:31");
  });

  it("Case D: Asia/Tokyo 00:30 is 今日, not 昨日 (UTC previous calendar day)", () => {
    // 2026-08-13 00:30 JST = 2026-08-12 15:30 UTC (UTC calendar date is still "yesterday")
    const now0030Jst = new Date("2026-08-12T15:30:00.000Z");
    const runAt0030 = "2026-08-12T15:30:00.000Z";

    expect(isInstantInZonedDay(runAt0030, now0030Jst, "Asia/Tokyo")).toBe(
      true,
    );

    const tokyoStart = startOfDayInTimeZone(now0030Jst, "Asia/Tokyo");
    const tokyoEnd = endOfDayInTimeZone(now0030Jst, "Asia/Tokyo");
    expect(tokyoStart.toISOString()).toBe("2026-08-12T15:00:00.000Z");
    expect(tokyoEnd.toISOString()).toBe("2026-08-13T15:00:00.000Z");

    // Later same Tokyo morning: Aug 13 09:00 JST = Aug 13 00:00 UTC.
    // Server UTC day-of-now [Aug12 00:00Z, Aug13 00:00Z) EXCLUDES this instant
    // while Tokyo "today" includes it — the date-boundary bug.
    const runAt0900Jst = "2026-08-13T00:00:00.000Z";
    const utcHostDayStart = new Date(
      now0030Jst.getFullYear(),
      now0030Jst.getMonth(),
      now0030Jst.getDate(),
    ).getTime();
    const utcHostDayEnd = utcHostDayStart + 24 * 60 * 60 * 1000;
    const t = Date.parse(runAt0900Jst);
    expect(t >= utcHostDayStart && t < utcHostDayEnd).toBe(false);
    expect(isInstantInZonedDay(runAt0900Jst, now0030Jst, "Asia/Tokyo")).toBe(
      true,
    );

    const summary = buildAutomationOperationsSummary({
      automations: [],
      runs: [
        sampleRun({
          id: "run_boundary",
          status: "succeeded",
          completedAt: runAt0900Jst,
          startedAt: runAt0900Jst,
          scheduledFor: runAt0900Jst,
          createdAt: runAt0900Jst,
        }),
      ],
      now: now0030Jst,
      timeZone: "Asia/Tokyo",
    });
    expect(summary.counts.succeededToday).toBe(1);
    expect(summary.todayWork[0]?.timeLabel).toBe("09:00");
  });
});
