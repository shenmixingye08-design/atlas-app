import { describe, expect, it } from "vitest";

import { parseNaturalLanguageAutomation } from "./create-from-natural-language";
import {
  formatAutomationChoicePrompt,
  matchAutomationsForOperate,
  parseAutomationNlOperate,
} from "./nl-operate";
import type { Automation } from "./types";

function sample(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "auto_1",
    userId: "u1",
    name: "毎朝のX投稿",
    description: "",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 8, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 08:00",
    },
    workflow: { assignment: "Xへ投稿して" },
    timing: { startDate: null, endCondition: { type: "never" } },
    executionLevel: "full_auto",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: { templateId: "sns_post", steps: [{ id: "post", enabled: true }] },
    destination: "x",
    enabled: true,
    lastRun: null,
    nextRun: "2026-08-15T23:00:00.000Z",
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseAutomationNlOperate", () => {
  it("keeps create phrases as create, not time-update", () => {
    expect(parseAutomationNlOperate("毎朝8時にX投稿して").kind).toBe("none");
    expect(parseNaturalLanguageAutomation("毎朝8時にX投稿して").ok).toBe(true);
  });

  it("parses the required natural-language operate set", () => {
    expect(parseAutomationNlOperate("9時に変えて")).toMatchObject({
      kind: "update_time",
      hour: 9,
    });
    expect(parseAutomationNlOperate("Xのやつ9時にして")).toMatchObject({
      kind: "update_time",
      hour: 9,
      wantsX: true,
    });
    expect(parseAutomationNlOperate("平日だけにして")).toMatchObject({
      kind: "update_weekdays",
      weekdays: [1, 2, 3, 4, 5],
    });
    expect(parseAutomationNlOperate("もう少し短めにして")).toMatchObject({
      kind: "update_content",
      contentOverride: { length: "short" },
    });
    expect(parseAutomationNlOperate("一旦止めて").kind).toBe("pause");
    expect(parseAutomationNlOperate("また動かして").kind).toBe("resume");
    expect(parseAutomationNlOperate("この自動化消して").kind).toBe("delete");
    expect(parseAutomationNlOperate("消していい").kind).toBe("confirm_delete");
    expect(parseAutomationNlOperate("次いつ投稿される？").kind).toBe("ask_next");
  });

  it("does not auto-pick when multiple X automations exist", () => {
    const rows = [
      sample({ id: "a", name: "朝のX" }),
      sample({ id: "b", name: "夜のX" }),
    ];
    const parsed = parseAutomationNlOperate("Xのやつ9時にして");
    const matched = matchAutomationsForOperate(rows, parsed);
    expect(matched).toHaveLength(2);
    const prompt = formatAutomationChoicePrompt(matched);
    expect(prompt).toContain("対象の自動化が複数あります");
    expect(prompt).toContain("朝のX");
    expect(prompt).not.toMatch(/occurrence|scheduler|cron/i);
  });
});
