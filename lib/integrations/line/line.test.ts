import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => false),
  loadSupabaseUserState: vi.fn(async () => null),
}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "skipped"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/notifications/durable", () => ({
  ensureNotificationsHydrated: vi.fn(async () => undefined),
  schedulePersistNotifications: vi.fn(),
}));

import {
  createLineLinkCode,
  saveLineUserLink,
  resetLineLinkStore,
  getLineLinkByAtlasUserId,
  unlinkLineUser,
  consumeLineLinkCode,
} from "./link-store";
import {
  dispatchLineNotification,
  formatLineNotificationText,
  handleLineWebhookEvents,
  isLineEventEnabled,
} from "./service";
import { verifyLineWebhookSignature, LineApiError } from "./messaging";
import {
  resetNotificationStore,
  saveStoredPreferences,
} from "@/lib/notifications/store";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/types";
import { claimDailyDigest, resetLineDigestDedupe } from "./digest-dedupe";
import { resetLineGlobalDurableForTests } from "./global-durable";
import { resetLineLinkHydrationForTests } from "./link-durable";

describe("LINE notifications", () => {
  beforeEach(() => {
    resetLineLinkStore();
    resetNotificationStore();
    resetLineDigestDedupe();
    resetLineGlobalDurableForTests();
    resetLineLinkHydrationForTests();
    vi.unstubAllEnvs();
    vi.stubEnv("LINE_CHANNEL_SECRET", "test-line-channel-secret");
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "test-line-access-token");
  });

  it("formats LINE push text", () => {
    const text = formatLineNotificationText({
      title: "仕事完了",
      message: "資料が完成しました",
      actionUrl: "/workspace",
    });
    expect(text).toContain("【MINERVOT】仕事完了");
    expect(text).toContain("資料が完成しました");
  });

  it("respects LINE event ON/OFF preferences", () => {
    const userId = "user_line_pref";
    saveStoredPreferences(userId, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      channels: { ...DEFAULT_NOTIFICATION_PREFERENCES.channels, line: true },
      lineEvents: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.lineEvents,
        mail_received: false,
      },
    });

    expect(isLineEventEnabled(userId, "work_completed")).toBe(true);
    expect(isLineEventEnabled(userId, "mail_received")).toBe(false);
  });

  it("verifies valid signatures and rejects invalid ones", () => {
    const body = '{"events":[]}';
    const digest = createHmac("sha256", "test-line-channel-secret")
      .update(body)
      .digest("base64");

    expect(verifyLineWebhookSignature(body, digest)).toBe(true);
    expect(verifyLineWebhookSignature(body, "tampered")).toBe(false);
    expect(verifyLineWebhookSignature(body, null)).toBe(false);
  });

  it("dedupes duplicate webhook event ids", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const events = [
      {
        type: "follow" as const,
        webhookEventId: "evt_dup_1",
        replyToken: "reply-1",
        source: { userId: "U_line_1" },
      },
    ];

    await handleLineWebhookEvents(events);
    await handleLineWebhookEvents(events);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not send when user is unlinked", async () => {
    const userId = "user_unlinked";
    saveStoredPreferences(userId, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      channels: { ...DEFAULT_NOTIFICATION_PREFERENCES.channels, line: true },
    });

    const result = await dispatchLineNotification({
      userId,
      event: "work_completed",
      title: "完了",
      message: "テスト",
    });
    expect(result).toEqual({ sent: false, reason: "not_linked" });
  });

  it("does not send when LINE channel is OFF", async () => {
    const userId = "user_line_off";
    saveLineUserLink({
      atlasUserId: userId,
      lineUserId: "U_off",
      displayName: null,
      linkedAt: new Date().toISOString(),
    });
    saveStoredPreferences(userId, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      channels: { ...DEFAULT_NOTIFICATION_PREFERENCES.channels, line: false },
    });

    const result = await dispatchLineNotification({
      userId,
      event: "work_completed",
      title: "完了",
      message: "テスト",
    });
    expect(result).toEqual({ sent: false, reason: "disabled" });
  });

  it("links via code, supports disconnect, and dedupes digests", async () => {
    const userId = "user_line_link";
    const code = createLineLinkCode(userId);
    expect(code.code).toMatch(/^\d{6}$/);
    expect(consumeLineLinkCode(code.code)?.atlasUserId).toBe(userId);

    saveLineUserLink({
      atlasUserId: userId,
      lineUserId: "U123",
      displayName: null,
      linkedAt: new Date().toISOString(),
    });
    expect(getLineLinkByAtlasUserId(userId)?.lineUserId).toBe("U123");

    expect(await claimDailyDigest(userId, "morning_briefing")).toBe(true);
    expect(await claimDailyDigest(userId, "morning_briefing")).toBe(false);

    unlinkLineUser(userId);
    expect(getLineLinkByAtlasUserId(userId)).toBeNull();
  });

  it("maps invalid token errors", () => {
    const error = new LineApiError("Authentication failed", 401);
    expect(error.status).toBe(401);
  });
});
