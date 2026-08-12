/**
 * Automation Phase 2 — V2 step → production integration wiring.
 *
 * 【ATLAS機能評価】
 * 機能名：Automation Phase 2 外部サービス実操作配線
 * ユーザー価値：定期自動化が実カレンダー/メール/投稿まで完遂し、手作業を削減
 * 差別化：UI接続表示ではなく provider resource ID 付き実操作証拠
 * 繰り返し作業の削減：はい（定例予定登録・送信・投稿の手動操作）
 * AI必要度：不要（既定文面・設定済み内容の実API実行）
 * AIなしで実装可能：はい
 * 運営コスト：外部API従量のみ（AI追加なし）
 * 外部APIコスト：有（Google / X / WordPress / Dropbox 従量）
 * コスト削減案：エコモード対象外 / まとめて生成N/A / 副作用claimキャッシュ /
 *   予約実行(既存scheduler) / AI起動なし / APIは承認後or full_auto時のみ /
 *   承認後実行維持 / 再生成禁止(idempotent side-effect)
 * 優先度：P0
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async () => "owner@example.com"),
}));
vi.mock("@/lib/billing/access", () => ({
  getBillingFeatureDenial: vi.fn(async () => null),
}));
vi.mock("@/lib/integrations/google/calendar/service", () => ({
  createCalendarEventForUser: vi.fn(),
}));
vi.mock("@/lib/integrations/google/gmail/service", () => ({
  sendComposeEmailForUser: vi.fn(),
  createComposeDraftForUser: vi.fn(),
  sendReplyForUser: vi.fn(),
}));
vi.mock("@/lib/integrations/x/post/service", () => ({
  postTweetNowForUser: vi.fn(),
}));
vi.mock("@/lib/integrations/wordpress/post/service", () => ({
  createWordPressPostForUser: vi.fn(),
}));
vi.mock("@/lib/integrations/dropbox/service", () => ({
  uploadDropboxFileForUser: vi.fn(),
}));

import { createCalendarEventForUser } from "@/lib/integrations/google/calendar/service";
import { sendComposeEmailForUser } from "@/lib/integrations/google/gmail/service";
import { postTweetNowForUser } from "@/lib/integrations/x/post/service";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import {
  isLiveAdapterWired,
  validateStepsForProductionActivation,
} from "@/lib/automation-platform/execution/production-step-registry";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import { executeIdempotentSideEffect } from "@/lib/side-effects/execute";
import { resetSideEffectStoreForTests } from "@/lib/side-effects/store";

const createCalendarEventForUserMock = vi.mocked(createCalendarEventForUser);
const sendComposeEmailForUserMock = vi.mocked(sendComposeEmailForUser);
const postTweetNowForUserMock = vi.mocked(postTweetNowForUser);

function step(
  partial: Partial<AutomationWorkflowStep> &
    Pick<AutomationWorkflowStep, "id" | "type" | "name">,
): AutomationWorkflowStep {
  return {
    id: partial.id,
    type: partial.type,
    name: partial.name,
    order: partial.order ?? 0,
    inputBindings: {},
    configuration: partial.configuration ?? {},
    requiresApproval: partial.requiresApproval ?? true,
    retryPolicy: { maxAttempts: 2, backoffMs: [0] },
    timeoutMs: 10_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

function withAppEnv(run: () => Promise<void>): Promise<void> {
  const prev = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    X_CLIENT_ID: process.env.X_CLIENT_ID,
    X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
    ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY:
      process.env.ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY,
    DROPBOX_CLIENT_ID: process.env.DROPBOX_CLIENT_ID,
    DROPBOX_CLIENT_SECRET: process.env.DROPBOX_CLIENT_SECRET,
  };
  process.env.GOOGLE_CLIENT_ID = "test-google-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  process.env.X_CLIENT_ID = "test-x-client";
  process.env.X_CLIENT_SECRET = "test-x-secret";
  process.env.ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY = "test-wp-key-32chars-minimum!!!!";
  process.env.DROPBOX_CLIENT_ID = "test-dbx";
  process.env.DROPBOX_CLIENT_SECRET = "test-dbx-secret";
  return run().finally(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

describe("Automation Phase 2 external live wiring", () => {
  beforeEach(() => {
    resetFeatureFlagStore();
    setFeatureFlagState("google", "on");
    setFeatureFlagState("x", "on");
    setFeatureFlagState("wordpress", "on");
    setFeatureFlagState("dropbox", "on");
    resetSideEffectStoreForTests();
    createCalendarEventForUserMock.mockReset();
    sendComposeEmailForUserMock.mockReset();
    postTweetNowForUserMock.mockReset();
  });

  it("wires live adapters for Calendar/Gmail/X/WordPress/Dropbox", () => {
    expect(isLiveAdapterWired("google_calendar")).toBe(true);
    expect(isLiveAdapterWired("google_gmail")).toBe(true);
    expect(isLiveAdapterWired("x")).toBe(true);
    expect(isLiveAdapterWired("wordpress")).toBe(true);
    expect(isLiveAdapterWired("dropbox")).toBe(true);
    expect(isLiveAdapterWired("slack")).toBe(false);

    const issues = validateStepsForProductionActivation([
      { id: "c", type: "google_calendar", enabled: true },
      { id: "g", type: "gmail", enabled: true },
      { id: "x", type: "x_post", enabled: true },
    ]);
    expect(issues).toEqual([]);
  });

  it("Case A — Calendar create returns event id evidence", async () => {
    await withAppEnv(async () => {
      createCalendarEventForUserMock.mockResolvedValue({
        status: "ready",
        event: {
          id: "evt_phase2_a",
          title: "週次定例",
          startAt: "2026-08-13T10:00:00.000Z",
          endAt: "2026-08-13T11:00:00.000Z",
          location: null,
          isAllDay: false,
          description: null,
          meetLink: null,
          htmlLink: "https://calendar.google.com/event?eid=evt_phase2_a",
        },
      });

      const result = await strictStepInvoker({
        step: step({
          id: "cal",
          type: "google_calendar",
          name: "予定",
          configuration: {
            eventTitle: "週次定例",
            action: "create",
            startAt: "2026-08-13T10:00:00.000Z",
            endAt: "2026-08-13T11:00:00.000Z",
          },
        }),
        userId: "user_p2",
        automationName: "週次",
        runId: "run_a",
        automationId: "auto_a",
        approved: true,
      });

      expect(result.ok).toBe(true);
      expect(result.artifacts[0]?.externalId).toBe("evt_phase2_a");
      expect(result.evidence?.externalActionIds).toContain("evt_phase2_a");
      expect(JSON.stringify(result)).not.toMatch(/access_token|Bearer\s/i);
      expect(createCalendarEventForUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user_p2",
          runId: "run_a",
          automationId: "auto_a",
          discriminator: "cal",
        }),
      );
    });
  });

  it("Case B — Gmail send returns message id evidence", async () => {
    await withAppEnv(async () => {
      sendComposeEmailForUserMock.mockResolvedValue({
        status: "ready",
        sentMessageId: "msg_phase2_b",
        threadId: "thr_phase2_b",
      });

      const result = await strictStepInvoker({
        step: step({
          id: "mail",
          type: "gmail",
          name: "送信",
          configuration: {
            to: "boss@example.com",
            subject: "週次報告",
            body: "本日の進捗です。",
            mode: "send",
          },
        }),
        userId: "user_p2",
        automationName: "週次メール",
        runId: "run_b",
        automationId: "auto_b",
        approved: true,
      });

      expect(result.ok).toBe(true);
      expect(result.artifacts[0]?.externalId).toBe("msg_phase2_b");
      expect(result.evidence?.externalActionIds).toContain("msg_phase2_b");
      expect(JSON.stringify(result)).not.toMatch(/ya29\.|access_token/i);
    });
  });

  it("Case C — X post returns tweet id evidence", async () => {
    await withAppEnv(async () => {
      postTweetNowForUserMock.mockResolvedValue({
        status: "ready",
        mode: "immediate",
        history: {
          id: "hist_1",
          userId: "user_p2",
          text: "Phase2 proof",
          mode: "immediate",
          status: "success",
          postedAt: new Date().toISOString(),
          tweetId: "tw_phase2_c",
          tweetUrl: "https://x.com/i/web/status/tw_phase2_c",
          errorMessage: null,
          scheduledFor: null,
          automationId: "auto_c",
          validation: {
            charCount: 12,
            maxChars: 280,
            urls: [],
            mentions: [],
            hashtags: [],
            errors: [],
          },
          driveFileUrl: null,
        },
      });

      const result = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration: { text: "Phase2 proof" },
        }),
        userId: "user_p2",
        automationName: "X自動",
        runId: "run_c",
        automationId: "auto_c",
        approved: true,
      });

      expect(result.ok).toBe(true);
      expect(result.artifacts[0]?.externalId).toBe("tw_phase2_c");
      expect(result.evidence?.externalActionIds).toContain("tw_phase2_c");
    });
  });

  it("Case D — credential missing fails closed (never completed)", async () => {
    await withAppEnv(async () => {
      createCalendarEventForUserMock.mockResolvedValue({
        status: "google_not_connected",
        message: "Google未接続",
      });

      const result = await strictStepInvoker({
        step: step({
          id: "cal",
          type: "google_calendar",
          name: "予定",
          configuration: { eventTitle: "失敗予定", action: "create" },
        }),
        userId: "user_no_cred",
        automationName: "未接続",
        runId: "run_d",
        automationId: "auto_d",
        approved: true,
      });

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("not_connected");
      expect(result.errorMessage).toBe("credential_missing");
      expect(result.artifacts).toEqual([]);
    });
  });

  it("Case E — provider API failure is not success; retryable classified", async () => {
    await withAppEnv(async () => {
      createCalendarEventForUserMock.mockRejectedValue(
        new Error("Google Calendar API 503 unavailable"),
      );

      const result = await strictStepInvoker({
        step: step({
          id: "cal",
          type: "google_calendar",
          name: "予定",
          configuration: { eventTitle: "一時障害", action: "create" },
        }),
        userId: "user_p2",
        automationName: "障害",
        runId: "run_e",
        automationId: "auto_e",
        approved: true,
      });

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("automation_run_failed");
      expect(result.retryable).toBe(true);
      expect(result.failedStage).toBe("EXTERNAL_PROVIDER_CALL");
    });
  });

  it("Case F — retry reuses side-effect claim (no double create)", async () => {
    let providerCalls = 0;
    const first = await executeIdempotentSideEffect(
      {
        userId: "user_p2",
        provider: "google_calendar",
        actionType: "create_event",
        destination: "primary",
        automationId: "auto_f",
        runId: "run_f",
        occurrenceKey: "run_f",
        discriminator: "cal",
      },
      async () => {
        providerCalls += 1;
        return {
          providerResourceId: "evt_once",
          result: { eventId: "evt_once" },
          evidence: { provider: "google_calendar" },
        };
      },
    );
    expect(first.executed).toBe(true);
    expect(providerCalls).toBe(1);

    const second = await executeIdempotentSideEffect(
      {
        userId: "user_p2",
        provider: "google_calendar",
        actionType: "create_event",
        destination: "primary",
        automationId: "auto_f",
        runId: "run_f",
        occurrenceKey: "run_f",
        discriminator: "cal",
      },
      async () => {
        providerCalls += 1;
        return {
          providerResourceId: "evt_dup",
          result: { eventId: "evt_dup" },
          evidence: { provider: "google_calendar" },
        };
      },
    );

    expect(second.reused).toBe(true);
    expect(second.executed).toBe(false);
    expect(second.result.eventId).toBe("evt_once");
    expect(providerCalls).toBe(1);
  });

  it("approval required blocks high-risk external without approval", async () => {
    await withAppEnv(async () => {
      const result = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration: { text: "should not post" },
          requiresApproval: true,
        }),
        userId: "user_p2",
        automationName: "承認",
        runId: "run_appr",
        automationId: "auto_appr",
        approved: false,
      });
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("automation_approval_required");
      expect(postTweetNowForUserMock).not.toHaveBeenCalled();
    });
  });

  it("app credentials missing fails closed before provider call", async () => {
    const prevId = process.env.GOOGLE_CLIENT_ID;
    const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    try {
      const result = await strictStepInvoker({
        step: step({
          id: "cal",
          type: "google_calendar",
          name: "予定",
          configuration: { eventTitle: "x", action: "create" },
        }),
        userId: "user_p2",
        automationName: "noapp",
        runId: "run_noapp",
        approved: true,
      });
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("not_connected");
      expect(createCalendarEventForUserMock).not.toHaveBeenCalled();
    } finally {
      if (prevId !== undefined) process.env.GOOGLE_CLIENT_ID = prevId;
      if (prevSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = prevSecret;
    }
  });
});
