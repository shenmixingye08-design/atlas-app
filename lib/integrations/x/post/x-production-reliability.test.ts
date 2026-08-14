import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async () => "test@example.com"),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: () => false,
}));

import { detectRecurringIntent } from "@/lib/automations/detect-recurring";
import { computeNextRunIso } from "@/lib/automations/schedule";
import {
  buildXDestinationExecutionFlow,
  shouldAutoPublishToX,
  shouldAwaitXPostApproval,
} from "@/lib/automations/x-recurring/destination";
import { createXApiError } from "@/lib/integrations/x/api-error";
import { checkXConnectionForUser } from "@/lib/integrations/x/connection-status";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import {
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import { resetExternalAuthHydration } from "@/lib/integrations/external-services/durable";
import {
  getExternalServiceConnection,
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { classifyXPostFailureForUser } from "@/lib/notifications/emitters";
import type { Automation } from "@/lib/automations/types";
import { DEFAULT_AUTOMATION_TIMING } from "@/lib/automations/timing-defaults";

import {
  maybeAutoPostToXAfterAutomation,
  maybeAutoPostToXAfterCommander,
} from "./automation";
import {
  classifyXPostError,
  insertDurableXPostJob,
  resetDurableXPostJobsForTests,
} from "./durable-x-post-jobs";
import { resetXPostHistoryStore } from "./history-store";
import { detectOneShotXSchedule } from "./one-shot-schedule";
import { auditXProductionConfig } from "./production-config-audit";
import { resetXScheduledPostsStore } from "./schedule-store";
import {
  postTweetNowForUser,
  processDueScheduledXPosts,
  scheduleTweetForUser,
} from "./service";
import { validateTweetText } from "./validate";
import { buildXPostDiagnostic } from "./diagnostics";

const USER = "user_x_reliability";
const CTX = { email: "test@example.com", isOwner: false, isBetaUser: true };
const X_TWEETS_API_URL = "https://api.twitter.com/2/tweets";

async function activatePlan(userId: string): Promise<void> {
  const { applySubscriptionFromStripe } = await import(
    "@/lib/billing/subscriptions/service"
  );
  await applySubscriptionFromStripe({
    userId,
    stripeCustomerId: `cus_${userId}`,
    stripeSubscriptionId: `sub_${userId}`,
    planId: "standard",
    status: "active",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}

function connectX(scopes = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
]): void {
  const connection = getExternalServiceConnection(USER, "x");
  saveExternalServiceConnection(USER, {
    ...connection,
    status: "connected",
    connectedAt: new Date().toISOString(),
    scopes,
    account: {
      email: "@atlas_user",
      name: "ATLAS User",
      pictureUrl: null,
      providerUserId: "xid_atlas",
      username: "atlas_user",
    },
  });
  saveExternalServiceCredentials({
    userId: USER,
    serviceId: "x",
    accessToken: "x-access-token",
    refreshToken: "x-refresh-token",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scope: scopes.join(" "),
    updatedAt: new Date().toISOString(),
  });
}

function stubXApi(tweetId: string): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("users/me")) {
      return new Response(
        JSON.stringify({
          data: { id: "xid_atlas", username: "atlas_user", name: "ATLAS User" },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/tweets/") && !url.endsWith("/tweets")) {
      return new Response(
        JSON.stringify({ data: { id: tweetId, text: "ok" } }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({ data: { id: tweetId, text: "ok" } }),
      { status: 201 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function countTweetCreates(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = String(input);
    const method = String(
      (init as RequestInit | undefined)?.method ?? "GET",
    ).toUpperCase();
    return url === X_TWEETS_API_URL && method === "POST";
  }).length;
}

function sampleXAutomation(
  patch: Partial<Automation> = {},
): Automation {
  return {
    id: "auto_x_rel",
    userId: USER,
    name: "X投稿",
    description: "",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 8, minute: 0 },
      cron: "0 8 * * *",
      timezone: "Asia/Tokyo",
      label: "毎日 08:00",
    },
    workflow: { assignment: "Xへ投稿して" },
    timing: DEFAULT_AUTOMATION_TIMING,
    executionLevel: "full_auto",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: buildXDestinationExecutionFlow("full_auto"),
    destination: "x",
    enabled: true,
    lastRun: null,
    nextRun: "2026-08-15T00:00:00.000Z",
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...patch,
  };
}

describe("X production reliability — NL + timezone", () => {
  it("1+2+3+4: 今すぐ / 予約 / 毎日 / 平日 / 月曜 / Asia/Tokyo", () => {
    const morning = detectRecurringIntent("毎朝8時にXへ投稿して");
    expect(morning.detected).toBe(true);
    if (!morning.detected) return;
    expect(morning.formDefaults.destination).toBe("x");
    expect(morning.formDefaults.hour).toBe(8);
    expect(morning.createInput.schedule.kind).toBe("schedule");
    if (morning.createInput.schedule.kind === "schedule") {
      expect(morning.createInput.schedule.timezone).toBe("Asia/Tokyo");
      expect(morning.createInput.schedule.preset.type).toBe("daily");
      if (morning.createInput.schedule.preset.type === "daily") {
        expect(morning.createInput.schedule.preset.hour).toBe(8);
      }
    }

    const evening = detectRecurringIntent("毎日19時にこの内容を投稿して");
    expect(evening.detected).toBe(true);
    if (evening.detected) {
      expect(evening.formDefaults.destination).toBe("x");
      expect(evening.formDefaults.hour).toBe(19);
    }

    const weekday = detectRecurringIntent("平日の朝9時にXを更新して");
    expect(weekday.detected).toBe(true);
    if (!weekday.detected) return;
    expect(weekday.formDefaults.destination).toBe("x");
    expect(weekday.formDefaults.hour).toBe(9);
    expect(weekday.formDefaults.weekdays).toEqual([1, 2, 3, 4, 5]);
    if (
      weekday.createInput.schedule.kind === "schedule" &&
      weekday.createInput.schedule.preset.type === "daily"
    ) {
      expect(weekday.createInput.schedule.preset.weekdays).toEqual([
        1, 2, 3, 4, 5,
      ]);
    }

    const weekly = detectRecurringIntent("毎週月曜日に投稿して");
    expect(weekly.detected).toBe(true);
    if (weekly.detected) {
      expect(weekly.formDefaults.destination).toBe("x");
      expect(weekly.formDefaults.frequency).toBe("weekly");
      expect(weekly.formDefaults.dayOfWeek).toBe(1);
    }

    expect(detectRecurringIntent("明日の12時に投稿して").detected).toBe(false);
    expect(
      detectRecurringIntent("この文章を今すぐXに投稿して").detected,
    ).toBe(false);

    const from = new Date("2026-08-13T00:00:00.000Z");
    const nextEight = computeNextRunIso(
      {
        kind: "schedule",
        preset: { type: "daily", hour: 8, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日 08:00",
      },
      from,
    );
    expect(nextEight).toBe("2026-08-13T23:00:00.000Z");

    const saturday = new Date("2026-08-15T01:00:00.000Z");
    const nextWeekday = computeNextRunIso(
      {
        kind: "schedule",
        preset: { type: "daily", hour: 9, minute: 0, weekdays: [1, 2, 3, 4, 5] },
        timezone: "Asia/Tokyo",
        label: "平日 09:00",
      },
      saturday,
    );
    expect(nextWeekday).toBe("2026-08-17T00:00:00.000Z");
  });

  it("schedules 明日の12時 in Asia/Tokyo without posting now", () => {
    const now = new Date("2026-08-14T03:00:00.000Z");
    const oneShot = detectOneShotXSchedule("明日の12時に投稿して", now);
    expect(oneShot).not.toBeNull();
    expect(oneShot?.timezone).toBe("Asia/Tokyo");
    expect(oneShot?.hour).toBe(12);
    expect(oneShot?.scheduledFor).toBe("2026-08-15T03:00:00.000Z");
  });
});

describe("X production reliability — execution gates", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("ATLAS_X_POST_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
    resetFeatureFlagStore();
    resetXPostHistoryStore();
    resetXScheduledPostsStore();
    resetDurableXPostJobsForTests();
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    const { resetUsageStore } = await import("@/lib/billing/usage/store");
    resetSubscriptionStore();
    resetUsageStore();
    await activatePlan(USER);
    setFeatureFlagState("x", "on");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("1: 今すぐ投稿 returns provider tweet id", async () => {
    connectX();
    const fetchMock = stubXApi("1980000000000001");
    const result = await postTweetNowForUser({
      userId: USER,
      text: "今すぐ投稿テスト #ATLAS",
      context: CTX,
      automationId: "auto_now",
      runId: "run_now",
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.history?.tweetId).toBe("1980000000000001");
    expect(result.history?.tweetUrl).toContain("1980000000000001");
    expect(countTweetCreates(fetchMock)).toBe(1);
  });

  it("2: 1回予約投稿 registers without calling X yet", async () => {
    connectX();
    const fetchMock = stubXApi("should_not_post");
    const scheduled = await scheduleTweetForUser({
      userId: USER,
      text: "予約本文です",
      scheduledFor: new Date(Date.now() + 120_000).toISOString(),
      context: CTX,
      automationId: "auto_once",
    });
    expect(scheduled.status).toBe("ready");
    if (scheduled.status !== "ready") return;
    expect(scheduled.scheduled?.text).toBe("予約本文です");
    expect(countTweetCreates(fetchMock)).toBe(0);
  });

  it("5: X未接続 is fail-closed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await postTweetNowForUser({
      userId: USER,
      text: "未接続",
      context: CTX,
    });
    expect(result.status).toBe("x_not_connected");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("6: token失効 asks to reconnect and does not post", async () => {
    connectX();
    const connection = getExternalServiceConnection(USER, "x");
    saveExternalServiceConnection(USER, {
      ...connection,
      status: "error",
      errorMessage: "トークンが失効しています",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await postTweetNowForUser({
      userId: USER,
      text: "失効",
      context: CTX,
    });
    expect(result.status).toBe("x_not_connected");
    if (result.status !== "x_not_connected") return;
    expect(result.reconnectRequired || result.message).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("7: scope不足 does not post and is not posting_ready", async () => {
    connectX(["tweet.read", "users.read", "offline.access"]);
    const fetchMock = stubXApi("must_not_exist");
    const result = await postTweetNowForUser({
      userId: USER,
      text: "権限不足",
      context: CTX,
    });
    expect(result.status).toBe("x_not_connected");
    if (result.status !== "x_not_connected") return;
    expect(result.message).toMatch(/Write|権限/);
    expect(countTweetCreates(fetchMock)).toBe(0);

    const check = await checkXConnectionForUser({ userId: USER, context: CTX });
    expect(check.status).toBe("ready");
    if (check.status !== "ready") return;
    expect(check.connected).toBe(true);
    expect(check.postingReady).toBe(false);
  });

  it("8+9+10: 429/500 retry, invalid payload no retry", () => {
    const rate = createXApiError(429, { title: "Too Many Requests" });
    expect(classifyXPostError(rate)).toMatchObject({
      retryable: true,
      permanent: false,
      code: "rate_limit",
    });
    const server = createXApiError(500, { title: "Internal" });
    expect(classifyXPostError(server)).toMatchObject({
      retryable: true,
      permanent: false,
      code: "transient",
    });
    const invalid = createXApiError(400, { title: "Invalid Request" });
    expect(classifyXPostError(invalid)).toMatchObject({
      retryable: false,
      permanent: true,
    });
    expect(
      classifyXPostError(new Error("投稿文が空です")),
    ).toMatchObject({ retryable: false, permanent: true });
    expect(
      classifyXPostError(new Error("tweet.write missing")),
    ).toMatchObject({ retryable: false, code: "insufficient_scope" });
  });

  it("11+12: worker retry and scheduler re-run do not double-post", async () => {
    connectX();
    const fetchMock = stubXApi("1980000000000011");
    await insertDurableXPostJob({
      ownerId: USER,
      content: "二重投稿防止",
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      automationId: "auto_dup",
    });

    const first = await processDueScheduledXPosts({
      resolveContext: async () => CTX,
      workerId: "w1",
    });
    expect(first[0]?.result.status).toBe("ready");
    if (first[0]?.result.status === "ready") {
      expect(first[0].result.history?.tweetId).toBe("1980000000000011");
    }

    const second = await processDueScheduledXPosts({
      resolveContext: async () => CTX,
      workerId: "w2",
    });
    const postedAgain = second.filter(
      (item) =>
        item.result.status === "ready" && item.result.history?.tweetId,
    );
    expect(postedAgain).toHaveLength(0);
    expect(countTweetCreates(fetchMock)).toBe(1);
  });

  it("13: approval mode does not post before confirmation", async () => {
    connectX();
    const fetchMock = stubXApi("must_not_post");
    const automation = sampleXAutomation({
      executionLevel: "approve_then_run",
      executionFlow: buildXDestinationExecutionFlow("approve_then_run"),
    });
    expect(shouldAwaitXPostApproval(automation)).toBe(true);
    expect(shouldAutoPublishToX(automation)).toBe(false);
    const result = await maybeAutoPostToXAfterAutomation({
      userId: USER,
      automation,
      content: "承認前本文",
      context: CTX,
      allowPublish: true,
    });
    expect(result.attempted).toBe(false);
    expect(countTweetCreates(fetchMock)).toBe(0);
  });

  it("14: missing tweet id is not completed", async () => {
    connectX();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: {} }), { status: 201 }),
      ),
    );
    const result = await postTweetNowForUser({
      userId: USER,
      text: "証拠なし",
      context: CTX,
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toMatch(/tweet id/i);
  });

  it("15: success stores externalActionId / tweetId", async () => {
    connectX();
    stubXApi("1980000000000015");
    const result = await postTweetNowForUser({
      userId: USER,
      text: "成功証拠 https://example.com #保存",
      context: CTX,
      automationId: "auto_ok",
      runId: "occ_ok",
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.history?.tweetId).toBe("1980000000000015");
    expect(result.history?.tweetUrl).toContain("/status/1980000000000015");
    expect(result.history?.status).toBe("success");
  });

  it("commander 明日の12時 schedules instead of posting", async () => {
    connectX();
    const fetchMock = stubXApi("no_immediate");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T03:00:00.000Z"));
    try {
      const result = await maybeAutoPostToXAfterCommander({
        userId: USER,
        templateId: "sns_post",
        assignment: "明日の12時に投稿して",
        finalResponse: "予約する本文",
        context: CTX,
      });
      expect(result.attempted).toBe(true);
      if (!result.attempted) return;
      expect(result.mode).toBe("schedule");
      expect(result.result.status).toBe("ready");
      if (result.result.status === "ready") {
        expect(result.result.scheduled?.scheduledFor).toBe(
          "2026-08-15T03:00:00.000Z",
        );
      }
      expect(countTweetCreates(fetchMock)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("X production reliability — content / diagnostics / cost", () => {
  it("accepts Japanese, emoji, newline, hashtag, and URL", () => {
    const text = "おはようございます☀️\n今日のメモです #MINERVOT\nhttps://example.com";
    const validation = validateTweetText(text);
    expect(validation.errors).toHaveLength(0);
    expect(validation.hashtags).toContain("#MINERVOT");
    expect(validation.urls).toContain("https://example.com");
  });

  it("diagnostics omit secrets and include trace fields", () => {
    const diagnostic = buildXPostDiagnostic({
      userId: USER,
      automationId: "auto_1",
      occurrenceId: "occ_1",
      runId: "run_1",
      jobId: "job_1",
      failedStage: "provider",
      developerCode: "rate_limit",
      providerStatus: 429,
      retryCount: 1,
      retryReason: "429",
      externalActionId: null,
      xAccountId: "xid_atlas",
    });
    expect(diagnostic.externalService).toBe("x");
    expect(diagnostic.diagnosticId).toMatch(/^xdiag_/);
    expect(JSON.stringify(diagnostic)).not.toMatch(/token|secret|bearer/i);
  });

  it("failure copy tells the user what to do next", () => {
    expect(classifyXPostFailureForUser("トークンが失効しています")).toContain(
      "再接続",
    );
    expect(classifyXPostFailureForUser("Write権限がありません")).toContain(
      "権限",
    );
    expect(classifyXPostFailureForUser("X APIエラー（500）")).toContain(
      "一時的",
    );
    expect(classifyXPostFailureForUser("投稿文が空です")).toContain("修正");
  });

  it("production config audit never prints secret values", () => {
    const items = auditXProductionConfig();
    const serialized = JSON.stringify(items);
    expect(items.length).toBeGreaterThan(0);
    expect(serialized).not.toMatch(/sk_|Bearer |twitter.*secret/i);
    for (const item of items) {
      expect(item).toHaveProperty("present");
      expect(typeof item.present).toBe("boolean");
    }
  });
});
