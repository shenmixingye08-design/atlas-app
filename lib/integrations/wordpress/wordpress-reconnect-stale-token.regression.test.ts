/**
 * Permanent CI guard: WordPress reconnect / disconnect must not use a
 * stale Application Password cached on another serverless isolate.
 *
 * CASE A: isolate A has old credential + connected
 * CASE B: isolate B disconnects and deletes the durable row
 * CASE C: isolate A then posts → no WP API, wp_not_connected, old password unused
 * CASE D: categories / tags / media upload / update post fail the same way
 * CASE E: durable read failure ≠ no credential row
 * CASE F: reconnect uses only the new credential
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const durableByUser = vi.hoisted(() => new Map<string, unknown>());
const durableReadFailed = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/integrations/wordpress/credential-persistence", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/wordpress/credential-persistence")
  >("@/lib/integrations/wordpress/credential-persistence");
  return {
    ...actual,
    readWordPressAuthFromDurable: vi.fn(async (userId: string) => {
      if (durableReadFailed.has(userId)) {
        return {
          status: "unavailable" as const,
          developerCode: "durable_read_failed" as const,
          reason: "timeout",
        };
      }
      const row = durableByUser.get(userId);
      if (!row) return { status: "missing" as const };
      return { status: "found" as const, value: row };
    }),
    loadWordPressAuthFromSupabase: vi.fn(async (userId: string) => {
      return durableByUser.get(userId) ?? null;
    }),
    persistWordPressAuthToSupabase: vi.fn(async () => true),
    deleteWordPressAuthFromSupabase: vi.fn(async (userId: string) => {
      durableByUser.delete(userId);
      return true;
    }),
  };
});

import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { resetExternalAuthHydration } from "@/lib/integrations/external-services/durable";
import {
  getExternalServiceConnection,
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import { wordpressServiceDefinition } from "@/lib/integrations/wordpress/definition";
import {
  getWordPressAuthContext,
  resolveWordPressAuthContext,
} from "@/lib/integrations/wordpress/connection-service";
import {
  getWordPressCredentials,
  resetWordPressCredentialStore,
  saveWordPressCredentials,
} from "@/lib/integrations/wordpress/credential-store";
import {
  createWordPressPostForUser,
  fetchWordPressCategoriesForUser,
  fetchWordPressTagsForUser,
  updateWordPressPostForUser,
  uploadWordPressMediaForUser,
} from "@/lib/integrations/wordpress/post/service";

const USER_A = "user_wp_stale_a";
const USER_B = "user_wp_stale_b";
const CTX = buildFeatureAccessContext(null);

function connectedWp(userId: string, password: string) {
  return {
    credentials: {
      userId,
      siteUrl: `https://${userId}.example.com`,
      username: `${userId}-editor`,
      applicationPassword: password,
      updatedAt: new Date().toISOString(),
    },
    connection: {
      ...createDefaultConnection(wordpressServiceDefinition),
      status: "connected" as const,
      connectedAt: new Date().toISOString(),
      lastUsedAt: null,
      scopes: [...wordpressServiceDefinition.plannedScopes],
      features: [...wordpressServiceDefinition.plannedFeatures],
      errorMessage: null,
      account: {
        email: `https://${userId}.example.com`,
        name: userId,
        pictureUrl: null,
        username: `${userId}-editor`,
      },
    },
  };
}

function seedIsolateA(password: string) {
  const seeded = connectedWp(USER_A, password);
  saveWordPressCredentials(seeded.credentials);
  saveExternalServiceConnection(USER_A, seeded.connection);
  durableByUser.set(USER_A, seeded);
  return seeded;
}

function disconnectOnIsolateB() {
  durableByUser.delete(USER_A);
}

function stubWpApiNever(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    throw new Error("WordPress API must not be called");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("WordPress disconnect cross-isolate stale credential (permanent)", () => {
  beforeEach(async () => {
    durableByUser.clear();
    durableReadFailed.clear();
    resetExternalServiceStore();
    resetWordPressCredentialStore();
    resetExternalAuthHydration();
    resetFeatureFlagStore();
    setFeatureFlagState("wordpress", "on");
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    const { resetUsageStore } = await import("@/lib/billing/usage/store");
    resetSubscriptionStore();
    resetUsageStore();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    durableByUser.clear();
    durableReadFailed.clear();
    resetExternalServiceStore();
    resetWordPressCredentialStore();
    resetExternalAuthHydration();
    vi.unstubAllGlobals();
  });

  it("CASE A: isolate A keeps old credential + connected in memory", () => {
    seedIsolateA("old-app-password-xxxx");
    expect(getWordPressAuthContext(USER_A)?.applicationPassword).toBe(
      "old-app-password-xxxx",
    );
    expect(getExternalServiceConnection(USER_A, "wordpress").status).toBe(
      "connected",
    );
  });

  it("CASE B: isolate B disconnect deletes the durable credential row", async () => {
    seedIsolateA("old-app-password-xxxx");
    const { disconnectWordPressAccount } = await import(
      "@/lib/integrations/wordpress/connection-service"
    );
    // Isolate B starts clean except for the shared durable map.
    resetWordPressCredentialStore();
    resetExternalServiceStore();
    await disconnectWordPressAccount(USER_A);
    expect(durableByUser.has(USER_A)).toBe(false);
  });

  it("CASE C: isolate A post after other-isolate disconnect is wp_not_connected", async () => {
    seedIsolateA("old-app-password-xxxx");
    disconnectOnIsolateB();
    const fetchMock = stubWpApiNever();

    const result = await createWordPressPostForUser({
      userId: USER_A,
      context: CTX,
      payload: {
        title: "切断後の投稿",
        content: "<p>本文</p>",
        status: "draft",
      },
    });

    expect(result.status).toBe("wp_not_connected");
    expect(result.developerCode).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getWordPressAuthContext(USER_A)).toBeNull();
    expect(getWordPressCredentials(USER_A)).toBeNull();
    expect(getExternalServiceConnection(USER_A, "wordpress").status).toBe(
      "disconnected",
    );
  });

  it("CASE D: categories / tags / media / update also fail closed", async () => {
    seedIsolateA("old-app-password-xxxx");
    disconnectOnIsolateB();
    const fetchMock = stubWpApiNever();

    const categories = await fetchWordPressCategoriesForUser({
      userId: USER_A,
      context: CTX,
    });
    expect(categories.status).toBe("wp_not_connected");

    seedIsolateA("old-app-password-xxxx");
    disconnectOnIsolateB();
    const tags = await fetchWordPressTagsForUser({
      userId: USER_A,
      context: CTX,
    });
    expect(tags.status).toBe("wp_not_connected");

    seedIsolateA("old-app-password-xxxx");
    disconnectOnIsolateB();
    const media = await uploadWordPressMediaForUser({
      userId: USER_A,
      context: CTX,
      imageUrl: "https://cdn.example.com/cover.jpg",
    });
    expect(media.status).toBe("wp_not_connected");

    seedIsolateA("old-app-password-xxxx");
    disconnectOnIsolateB();
    const updated = await updateWordPressPostForUser({
      userId: USER_A,
      context: CTX,
      postId: 42,
      payload: {
        title: "更新",
        content: "<p>更新本文</p>",
        status: "draft",
      },
    });
    expect(updated.status).toBe("wp_not_connected");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CASE E: durable read failure is not treated as disconnect", async () => {
    seedIsolateA("old-app-password-xxxx");
    durableReadFailed.add(USER_A);
    const fetchMock = stubWpApiNever();

    const posted = await createWordPressPostForUser({
      userId: USER_A,
      context: CTX,
      payload: {
        title: "障害時の投稿",
        content: "<p>本文</p>",
        status: "draft",
      },
    });
    expect(posted.status).toBe("durable_unavailable");
    expect(posted.developerCode).toBe("durable_read_failed");
    expect(posted.httpStatus).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getWordPressAuthContext(USER_A)?.applicationPassword).toBe(
      "old-app-password-xxxx",
    );
    expect(getExternalServiceConnection(USER_A, "wordpress").status).toBe(
      "connected",
    );

    const resolved = await resolveWordPressAuthContext(USER_A);
    expect(resolved.status).toBe("unavailable");
    if (resolved.status === "unavailable") {
      expect(resolved.developerCode).toBe("durable_read_failed");
    }
  });

  it("CASE F: after reconnect only the new credential is used", async () => {
    const stale = connectedWp(USER_A, "old-app-password-xxxx");
    saveWordPressCredentials(stale.credentials);
    saveExternalServiceConnection(USER_A, stale.connection);
    durableByUser.set(USER_A, connectedWp(USER_A, "new-app-password-yyyy"));

    const resolved = await resolveWordPressAuthContext(USER_A);
    expect(resolved.status).toBe("ready");
    if (resolved.status === "ready") {
      expect(resolved.auth.applicationPassword).toBe("new-app-password-yyyy");
      expect(resolved.auth.applicationPassword).not.toBe("old-app-password-xxxx");
    }
    expect(getWordPressAuthContext(USER_A)?.applicationPassword).toBe(
      "new-app-password-yyyy",
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/posts") && !url.match(/\/posts\/\d+/)) {
        return new Response(
          JSON.stringify({
            id: 99,
            link: "https://user_wp_stale_a.example.com/?p=99",
            status: "draft",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const posted = await createWordPressPostForUser({
      userId: USER_A,
      context: CTX,
      payload: {
        title: "再接続後の投稿",
        content: "<p>本文</p>",
        status: "draft",
      },
    });
    expect(posted.status).toBe("draft_saved");
    expect(fetchMock).toHaveBeenCalled();
    const authHeader = (
      fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit?]>
    )
      .map(([, init]) => {
        const headers = init?.headers;
        if (headers instanceof Headers) {
          return headers.get("Authorization") ?? "";
        }
        if (Array.isArray(headers)) {
          return headers.find(([key]) => key.toLowerCase() === "authorization")?.[1] ?? "";
        }
        const record = (headers ?? {}) as Record<string, string>;
        return record.Authorization ?? record.authorization ?? "";
      })
      .find((value) => value.startsWith("Basic "));
    expect(authHeader).toBeTruthy();
    const decoded = Buffer.from(authHeader!.slice(6), "base64").toString("utf8");
    expect(decoded).toContain("new-app-password-yyyy");
    expect(decoded).not.toContain("old-app-password-xxxx");
  });

  it("other user password is not read", async () => {
    durableByUser.set(USER_A, connectedWp(USER_A, "a-password"));
    durableByUser.set(USER_B, connectedWp(USER_B, "b-password"));
    const ctx = await resolveWordPressAuthContext(USER_A);
    expect(ctx.status).toBe("ready");
    if (ctx.status === "ready") {
      expect(ctx.auth.applicationPassword).toBe("a-password");
      expect(ctx.auth.applicationPassword).not.toBe("b-password");
      expect(ctx.auth.siteUrl).toBe("https://user_wp_stale_a.example.com");
    }
  });
});
