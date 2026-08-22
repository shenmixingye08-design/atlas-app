/**
 * Permanent CI guard: X reconnect must not post with a stale isolate cache.
 *
 * Production: callback 302 + connected UI, then ~30s later tweet 401
 * (failedStage=oauth, reconnect_required). Connect hydrated old tokens
 * on isolate A; callback persisted new tokens on isolate B; A's 60s TTL
 * skipped durable reload.
 *
 * CASE A: reconnect後は旧tokenを使わない
 * CASE B: callback persist後のpostは新token fingerprint一致
 * CASE C: 別serverless instanceでもdurable最新token
 * CASE D: 期限切れaccess + valid refresh は refreshして投稿
 * CASE E: refresh不可の場合のみ reconnect_required
 * CASE F: 他ユーザーtokenを読まない
 * CASE G: 二重投稿しない
 * CASE H: auto / manual は同じ最新credential
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async () => "test@example.com"),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: () => false,
}));

const durableByUser = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/integrations/x/credential-persistence", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/x/credential-persistence")
  >("@/lib/integrations/x/credential-persistence");
  return {
    ...actual,
    loadXAuthFromSupabase: vi.fn(async (userId: string) => {
      const row = durableByUser.get(userId);
      return row ?? null;
    }),
    persistXAuthToSupabase: vi.fn(async (credentials, connection) => {
      if (credentials.userId) {
        durableByUser.set(credentials.userId, { credentials, connection });
      }
      return true;
    }),
    deleteXAuthFromSupabase: vi.fn(async (userId: string) => {
      durableByUser.delete(userId);
      return true;
    }),
  };
});

vi.mock("@/lib/integrations/google/credential-persistence", () => ({
  loadGoogleAuthFromSupabase: vi.fn(async () => null),
}));

vi.mock("@/lib/integrations/dropbox/credential-persistence", () => ({
  loadDropboxAuthFromSupabase: vi.fn(async () => null),
}));

vi.mock("@/lib/integrations/wordpress/credential-persistence", () => ({
  loadWordPressAuthFromSupabase: vi.fn(async () => null),
}));

import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import {
  getExternalServiceCredentials,
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import {
  ensureExternalAuthHydrated,
  resetExternalAuthHydration,
} from "@/lib/integrations/external-services/durable";
import {
  getExternalServiceConnection,
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import { googleServiceDefinition } from "@/lib/integrations/google/definition";
import { completeXAccountOAuth } from "@/lib/integrations/x/oauth-service";
import { getXAccountAccessTokenResult } from "@/lib/integrations/x/token-manager";
import { fingerprintSecret } from "@/lib/integrations/x/token-fingerprint";
import { xServiceDefinition } from "@/lib/integrations/x/definition";
import {
  postTweetAutoForUser,
  postTweetNowForUser,
} from "@/lib/integrations/x/post/service";
import { resetXPostHistoryStore } from "@/lib/integrations/x/post/history-store";
import { isSensitiveLogKey } from "@/lib/security/redact";

const USER_A = "user_x_stale_a";
const USER_B = "user_x_stale_b";
const CTX = { email: "test@example.com", isOwner: false, isBetaUser: true };
const WRITE_SCOPES = "tweet.read tweet.write users.read offline.access";

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

function connectedX(
  userId: string,
  accessToken: string,
  extras?: { refreshToken?: string; expiresAt?: string; username?: string },
) {
  const credentials = {
    userId,
    serviceId: "x" as const,
    accessToken,
    refreshToken: extras?.refreshToken ?? `${accessToken}-refresh`,
    expiresAt: extras?.expiresAt ?? new Date(Date.now() + 3600_000).toISOString(),
    scope: WRITE_SCOPES,
    updatedAt: new Date().toISOString(),
  };
  const connection = {
    ...createDefaultConnection(xServiceDefinition),
    status: "connected" as const,
    connectedAt: new Date().toISOString(),
    lastUsedAt: null,
    scopes: WRITE_SCOPES.split(" "),
    features: [...xServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: {
      email: `@${extras?.username ?? "Atlaskxsom"}`,
      name: "ATLAS",
      pictureUrl: null,
      providerUserId: "xid_1",
      username: extras?.username ?? "Atlaskxsom",
    },
  };
  return { credentials, connection };
}

function seedMemory(userId: string, accessToken: string) {
  const seeded = connectedX(userId, accessToken);
  saveExternalServiceCredentials(seeded.credentials);
  saveExternalServiceConnection(userId, seeded.connection);
  return seeded;
}

function seedDurable(userId: string, accessToken: string) {
  const seeded = connectedX(userId, accessToken);
  durableByUser.set(userId, seeded);
  return seeded;
}

function stubXTweetApi(tweetId: string): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("oauth2/token")) {
      return new Response(
        JSON.stringify({
          access_token: "refreshed-access",
          refresh_token: "refreshed-refresh",
          expires_in: 7200,
          scope: WRITE_SCOPES,
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
    if (url.includes("/2/tweets")) {
      return new Response(
        JSON.stringify({ data: { id: tweetId, text: "ok" } }),
        { status: 201 },
      );
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function countTweetCreates(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = String(input);
    return url.includes("/2/tweets") && !url.includes("/tweets/") && init?.method === "POST";
  }).length;
}

function bearerUsed(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map(([, init]) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const auth = headers.Authorization ?? headers.authorization ?? "";
      return auth.replace(/^Bearer\s+/i, "");
    })
    .filter((token) => token.length > 0 && !token.startsWith("Basic"));
}

describe("X reconnect stale token (permanent)", () => {
  beforeEach(async () => {
    durableByUser.clear();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
    resetFeatureFlagStore();
    resetXPostHistoryStore();
    (
      globalThis as typeof globalThis & {
        __atlasXRecentPosts?: Map<string, unknown>;
      }
    ).__atlasXRecentPosts = new Map();
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    const { resetUsageStore } = await import("@/lib/billing/usage/store");
    resetSubscriptionStore();
    resetUsageStore();
    await activatePlan(USER_A);
    setFeatureFlagState("x", "on");
    vi.stubEnv("X_CLIENT_ID", "test-x-client-id");
    vi.stubEnv("X_CLIENT_SECRET", "test-x-client-secret");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    durableByUser.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fingerprints never equal the raw token and stay log-safe", () => {
    const raw = "x-secret-access-token-value";
    const fp = fingerprintSecret(raw);
    expect(fp).toHaveLength(16);
    expect(fp).not.toBe(raw);
    expect(fp).toBe(fingerprintSecret(raw));
    expect(isSensitiveLogKey("callbackAccessTokenFingerprint")).toBe(false);
    expect(isSensitiveLogKey("loadedForPostFingerprint")).toBe(false);
    expect(isSensitiveLogKey("access_token")).toBe(true);
  });

  it("CASE A: reconnect後は旧tokenを絶対使用しない", async () => {
    seedDurable(USER_A, "old-stale-access");
    await ensureExternalAuthHydrated(USER_A);
    expect(getExternalServiceCredentials(USER_A, "x")?.accessToken).toBe(
      "old-stale-access",
    );

    const googleBefore = saveExternalServiceCredentials({
      userId: USER_A,
      serviceId: "google",
      accessToken: "google-keep",
      refreshToken: "google-refresh",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: "calendar",
      updatedAt: new Date().toISOString(),
    });
    saveExternalServiceConnection(USER_A, {
      ...createDefaultConnection(googleServiceDefinition),
      status: "connected",
      connectedAt: new Date().toISOString(),
    });

    // Callback on another isolate persisted the new token. This isolate
    // still has a warm 60s hydration TTL + old in-memory X credentials.
    seedDurable(USER_A, "new-reconnect-access");
    expect(getExternalServiceCredentials(USER_A, "x")?.accessToken).toBe(
      "old-stale-access",
    );

    const result = await getXAccountAccessTokenResult(USER_A);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.accessToken).toBe("new-reconnect-access");
    expect(result.accessToken).not.toBe("old-stale-access");
    expect(getExternalServiceCredentials(USER_A, "google")?.accessToken).toBe(
      googleBefore.accessToken,
    );
  });

  it("CASE B: callback persist後のpostは新token fingerprint一致", async () => {
    seedMemory(USER_A, "old-stale-access");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("oauth2/token") && !url.includes("revoke")) {
          return new Response(
            JSON.stringify({
              access_token: "callback-new-access",
              refresh_token: "callback-new-refresh",
              expires_in: 7200,
              scope: WRITE_SCOPES,
            }),
            { status: 200 },
          );
        }
        if (url.includes("users/me")) {
          return new Response(
            JSON.stringify({
              data: { id: "xid_1", username: "Atlaskxsom", name: "ATLAS" },
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    await completeXAccountOAuth(
      USER_A,
      "auth-code",
      "verifier",
      "https://atlasapp.jp",
    );

    const persisted = durableByUser.get(USER_A) as {
      credentials: { accessToken: string };
    };
    expect(persisted.credentials.accessToken).toBe("callback-new-access");
    expect(persisted.credentials.accessToken).not.toBe("old-stale-access");

    const token = await getXAccountAccessTokenResult(USER_A);
    expect(token.status).toBe("ready");
    if (token.status !== "ready") return;
    expect(fingerprintSecret(token.accessToken)).toBe(
      fingerprintSecret("callback-new-access"),
    );
    expect(fingerprintSecret(token.accessToken)).not.toBe(
      fingerprintSecret("old-stale-access"),
    );
  });

  it("CASE C: 別serverless instanceでもdurable最新tokenを使う", async () => {
    seedDurable(USER_A, "durable-latest-access");
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();

    expect(getExternalServiceCredentials(USER_A, "x")).toBeNull();
    const result = await getXAccountAccessTokenResult(USER_A);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.accessToken).toBe("durable-latest-access");
  });

  it("CASE D: 期限切れaccess + valid refresh はrefreshして投稿", async () => {
    const expired = connectedX(USER_A, "expired-access", {
      refreshToken: "valid-refresh",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    durableByUser.set(USER_A, expired);
    const fetchMock = stubXTweetApi("1990000000000001");

    const token = await getXAccountAccessTokenResult(USER_A);
    expect(token).toEqual({ status: "ready", accessToken: "refreshed-access" });
    expect(
      (durableByUser.get(USER_A) as { credentials: { accessToken: string } })
        .credentials.accessToken,
    ).toBe("refreshed-access");

    const posted = await postTweetNowForUser({
      userId: USER_A,
      text: "refresh後の投稿です",
      context: CTX,
    });
    expect(posted.status).toBe("ready");
    expect(bearerUsed(fetchMock).some((token) => token === "refreshed-access")).toBe(
      true,
    );
  });

  it("CASE E: refresh不可の場合のみ reconnect_required", async () => {
    const expired = connectedX(USER_A, "expired-access", {
      refreshToken: "dead-refresh",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    durableByUser.set(USER_A, expired);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
      ),
    );

    const result = await getXAccountAccessTokenResult(USER_A);
    expect(result.status).toBe("refresh_failed");
    expect(getExternalServiceConnection(USER_A, "x").status).toBe("error");
  });

  it("CASE F: 他ユーザーtokenを絶対読まない", async () => {
    seedDurable(USER_A, "user-a-secret-access");
    seedMemory(USER_B, "user-b-memory-access");

    const stolen = await getXAccountAccessTokenResult(USER_B);
    if (stolen.status === "ready") {
      expect(stolen.accessToken).not.toBe("user-a-secret-access");
    }
    expect(getExternalServiceCredentials(USER_B, "x")?.accessToken).not.toBe(
      "user-a-secret-access",
    );
  });

  it("CASE G: 二重投稿しない", async () => {
    seedDurable(USER_A, "post-access");
    seedMemory(USER_A, "post-access");
    const fetchMock = stubXTweetApi("1981111111111111");
    const text = "同じ本文の二重投稿防止";

    const first = await postTweetNowForUser({
      userId: USER_A,
      text,
      context: CTX,
    });
    const second = await postTweetNowForUser({
      userId: USER_A,
      text,
      context: CTX,
    });
    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(countTweetCreates(fetchMock)).toBe(1);
  });

  it("CASE H: auto / manual は同じ最新credential", async () => {
    seedMemory(USER_A, "old-stale-access");
    seedDurable(USER_A, "shared-latest-access");
    const fetchMock = stubXTweetApi("1982222222222222");

    const manual = await postTweetNowForUser({
      userId: USER_A,
      text: "手動投稿の本文です",
      context: CTX,
    });
    const auto = await postTweetAutoForUser({
      userId: USER_A,
      text: "自動投稿の本文です",
      context: CTX,
    });
    expect(manual.status).toBe("ready");
    expect(auto.status).toBe("ready");
    const bearers = bearerUsed(fetchMock);
    expect(bearers.every((token) => token === "shared-latest-access")).toBe(true);
    expect(bearers).not.toContain("old-stale-access");
  });
});
