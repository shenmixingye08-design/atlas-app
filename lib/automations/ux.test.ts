import { describe, expect, it } from "vitest";

import type { Automation } from "./types";
import {
  AUTOMATION_FIRST_EXAMPLE,
  AUTOMATION_UX_JARGON_RE,
  assertNoUxJargon,
  buildAutomationPreview,
  describeApprovalMethod,
  explainAutomationFailure,
  formatDeleteConfirm,
  formatFirstSuccessCopy,
  formatRegistrationSuccess,
  formatUserDateTime,
  formatUserNextRun,
  resolveAutomationUserStatus,
} from "./ux";

function sample(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "auto_ux",
    userId: "user_ux",
    name: "毎朝のX投稿",
    description: "Xへ投稿",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 8, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 08:00",
    },
    workflow: {
      assignment: "Xへ投稿して",
      metadata: {
        appliedPreferenceLabels: ["短めの文章", "絵文字少なめ", "ハッシュタグ最大2個"],
      },
    },
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

describe("automation UX copy", () => {
  it("formats next run as 今日 / 明日 / 月日 without UTC", () => {
    const now = new Date("2026-08-14T01:00:00.000Z");
    expect(
      formatUserNextRun({
        nextRun: "2026-08-13T23:00:00.000Z",
        enabled: true,
        now,
      }),
    ).toBe("今日 08:00");
    expect(
      formatUserNextRun({
        nextRun: "2026-08-14T23:00:00.000Z",
        enabled: true,
        now,
      }),
    ).toBe("明日 08:00");
    expect(
      formatUserDateTime("2026-08-18T00:00:00.000Z", { now }),
    ).toBe("8月18日（火） 09:00");
    expect(formatUserNextRun({ nextRun: "2026-08-15T23:00:00.000Z", enabled: false })).toBe(
      "一時停止中",
    );
    expect(
      formatUserNextRun({
        nextRun: "2026-08-15T23:00:00.000Z",
        enabled: true,
        status: "awaiting_approval",
      }),
    ).toBe("承認待ち");
    expect(formatUserDateTime("2026-08-15T23:00:00.000Z")).not.toMatch(/T00:00|UTC|Z$/);
  });

  it("builds a first-time preview without jargon", () => {
    const preview = buildAutomationPreview(sample());
    expect(preview.action).toBe("Xへ投稿");
    expect(preview.frequency).toBe("毎日 08:00");
    expect(preview.approvalLabel).toBe("自動で実行");
    expect(preview.memoryLabels).toEqual([
      "短めの文章",
      "絵文字少なめ",
      "ハッシュタグ最大2個",
    ]);
    const success = formatRegistrationSuccess(sample());
    expect(success).toContain("自動化しました");
    expect(success).toContain("Xへ投稿");
    expect(success).toContain("次回：");
    expect(success).toContain("あなたの好みを反映");
    expect(assertNoUxJargon(success)).toBe(true);
    expect(AUTOMATION_FIRST_EXAMPLE).toBe("毎朝8時にX投稿して");
  });

  it("shows override separately from personal memory", () => {
    const preview = buildAutomationPreview(
      sample({
        workflow: {
          assignment: "この投稿だけ詳しく",
          metadata: {
            appliedPreferenceLabels: ["短めの文章"],
            memorySnapshot: {
              overriddenPreferences: { length: "long" },
            },
          },
        },
      }),
    );
    expect(preview.memoryLabels).toContain("短めの文章");
    expect(preview.overrideLabels.some((label) => label.includes("この自動化では"))).toBe(
      true,
    );
    expect(preview.overrideLabels.join()).not.toMatch(/memoryId|confidence/i);
  });

  it("maps failure codes to reconnect / permission / retry copy", () => {
    expect(explainAutomationFailure("x_not_connected")).toEqual({
      title: "X接続切れ",
      body: "Xとの接続が切れています。再接続すると自動投稿を再開できます。",
    });
    expect(explainAutomationFailure("tweet.write 権限がありません")).toEqual({
      title: "権限不足",
      body: "Xへの投稿権限がありません。X連携を確認してください。",
    });
    expect(explainAutomationFailure("429 timeout")).toEqual({
      title: "一時障害",
      body: "一時的な問題で実行できませんでした。自動で再試行します。",
    });
    expect(explainAutomationFailure("nextRunAt worker cron")).toMatchObject({
      title: "実行に失敗しました",
    });
    expect(explainAutomationFailure("nextRunAt worker cron").body).not.toMatch(
      AUTOMATION_UX_JARGON_RE,
    );
  });

  it("keeps user statuses and delete confirm human", () => {
    expect(resolveAutomationUserStatus(sample({ enabled: false }))).toBe("paused");
    expect(resolveAutomationUserStatus(sample({ status: "failed" }))).toBe("failed");
    expect(
      resolveAutomationUserStatus(
        sample({
          runHistory: [
            {
              id: "h1",
              status: "awaiting_approval",
              startedAt: "2026-08-14T00:00:00.000Z",
              completedAt: "2026-08-14T00:00:00.000Z",
              error: null,
              triggerType: "automation",
            },
          ],
        }),
      ),
    ).toBe("awaiting_approval");
    const confirm = formatDeleteConfirm(sample());
    expect(confirm).toContain("毎朝のX投稿");
    expect(confirm).toContain("毎日 08:00");
    expect(confirm).toContain("一時停止");
    expect(describeApprovalMethod("approve_then_run").label).toBe("実行前に確認");
    expect(
      formatFirstSuccessCopy(sample({ successCount: 1, status: "success" })),
    ).toContain("自分で操作せずに");
  });
});
