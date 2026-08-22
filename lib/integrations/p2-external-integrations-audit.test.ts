/**
 * P2: regular-user external integration isolation, limits, unlink, expiry.
 * Owner bypass is not used for these cases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => null,
}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => {
    if (userId.startsWith("owner_")) return "owner@atlas.test";
    return `${userId}@example.com`;
  }),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: (email: string | null | undefined) =>
    Boolean(email?.startsWith("owner@") && email.endsWith("@atlas.test")),
}));

import { evaluateBillingExternalIntegration } from "@/lib/billing/access/snapshot";
import { applySubscriptionFromStripe } from "@/lib/billing/subscriptions/service";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { evaluateExternalServiceConnectAccess } from "@/lib/integrations/external-services/connect-access";
import {
  deleteExternalServiceCredentials,
  getExternalServiceCredentials,
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import { resetExternalAuthHydration } from "@/lib/integrations/external-services/durable";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import {
  getExternalServiceConnection,
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { getDropboxRedirectUri } from "@/lib/integrations/dropbox/config";
import { getDropboxAccessToken } from "@/lib/integrations/dropbox/oauth-service";
import { getXRedirectUri } from "@/lib/integrations/x/config";
import { disconnectXAccount } from "@/lib/integrations/x/oauth-service";
import { getXAccountAccessTokenResult } from "@/lib/integrations/x/token-manager";
import { getGoogleAccountAccessTokenResult } from "@/lib/integrations/google/token-manager";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";

async function setPlan(
  userId: string,
  planId: "free" | "light" | "standard" | "premium",
) {
  await applySubscriptionFromStripe({
    userId,
    stripeCustomerId: `cus_${userId}`,
    stripeSubscriptionId: `sub_${userId}`,
    planId,
    status: "active",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}

function seedConnected(
  userId: string,
  serviceId: "x" | "google" | "dropbox" | "wordpress",
  tokenSuffix: string,
) {
  saveExternalServiceCredentials({
    userId,
    serviceId,
    accessToken: `access_${tokenSuffix}`,
    refreshToken: `refresh_${tokenSuffix}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scope: "test",
    updatedAt: new Date().toISOString(),
  });
  const current = getExternalServiceConnection(userId, serviceId);
  saveExternalServiceConnection(userId, {
    ...current,
    status: "connected",
    connectedAt: new Date().toISOString(),
    account: {
      email: `${userId}@provider.test`,
      name: userId,
      pictureUrl: null,
      providerUserId: `pid_${tokenSuffix}`,
    },
  });
}

describe("P2 external integration audit (regular users)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetSubscriptionStore();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
    vi.stubEnv("X_CLIENT_ID", "test-x-client");
    vi.stubEnv("X_CLIENT_SECRET", "test-x-secret");
    vi.stubEnv("DROPBOX_APP_KEY", "test-dbx-key");
    vi.stubEnv("DROPBOX_APP_SECRET", "test-dbx-secret");
    vi.stubEnv("OAUTH_STATE_SECRET", "test-oauth-state-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("separates user A and user B credentials (no overwrite / no cross-read)", async () => {
    seedConnected("user_a", "x", "a");
    seedConnected("user_b", "x", "b");

    expect(getExternalServiceCredentials("user_a", "x")?.accessToken).toBe(
      "access_a",
    );
    expect(getExternalServiceCredentials("user_b", "x")?.accessToken).toBe(
      "access_b",
    );
    expect(getExternalServiceCredentials("user_a", "x")?.userId).toBe("user_a");
    expect(getExternalServiceCredentials("user_b", "x")?.userId).toBe("user_b");

    const tokenA = await getXAccountAccessTokenResult("user_a");
    const tokenB = await getXAccountAccessTokenResult("user_b");
    expect(tokenA).toEqual({ status: "ready", accessToken: "access_a" });
    expect(tokenB).toEqual({ status: "ready", accessToken: "access_b" });
  });

  it("does not let user B read user A Google or Dropbox tokens", async () => {
    seedConnected("user_a", "google", "ga");
    seedConnected("user_a", "dropbox", "da");
    expect(getExternalServiceCredentials("user_b", "google")).toBeNull();
    expect(getExternalServiceCredentials("user_b", "dropbox")).toBeNull();
    expect(await getGoogleAccountAccessTokenResult("user_b")).toEqual({
      status: "missing",
    });
    expect(await getDropboxAccessToken("user_b")).toBeNull();
  });

  it("enforces Light/Standard/Premium externalIntegrations on the server", async () => {
    await setPlan("user_light_lim", "light");
    expect(
      (await evaluateExternalServiceConnectAccess("user_light_lim", "x")).denial,
    ).toBeNull();
    seedConnected("user_light_lim", "x", "l1");
    expect(
      (await evaluateExternalServiceConnectAccess("user_light_lim", "dropbox"))
        .denial?.status,
    ).toBe(403);

    await setPlan("user_std_lim", "standard");
    seedConnected("user_std_lim", "x", "s1");
    seedConnected("user_std_lim", "google", "s2");
    seedConnected("user_std_lim", "dropbox", "s3");
    expect(
      (await evaluateExternalServiceConnectAccess("user_std_lim", "wordpress"))
        .denial?.status,
    ).toBe(403);

    await setPlan("user_prem_lim", "premium");
    for (const id of ["x", "google", "dropbox", "wordpress"] as const) {
      seedConnected("user_prem_lim", id, id);
    }
    expect(
      (await evaluateExternalServiceConnectAccess("user_prem_lim", "x")).denial,
    ).toBeNull();
    expect(
      (await evaluateBillingExternalIntegration("user_prem_lim", 10)).denial
        ?.status,
    ).toBe(403);
    expect(
      (await evaluateBillingExternalIntegration("user_prem_lim", 9)).denial,
    ).toBeNull();
  });

  it("allows one Free X connect and blocks Light Google connect", async () => {
    await setPlan("user_free_x", "free");
    expect(
      (await evaluateExternalServiceConnectAccess("user_free_x", "x")).denial,
    ).toBeNull();
    seedConnected("user_free_x", "x", "fx");
    expect(
      (await evaluateExternalServiceConnectAccess("user_free_x", "dropbox"))
        .denial?.status,
    ).toBe(403);

    await setPlan("user_light_g", "light");
    expect(
      (await evaluateExternalServiceConnectAccess("user_light_g", "google"))
        .denial?.status,
    ).toBe(403);
    expect(
      (await evaluateExternalServiceConnectAccess("user_light_g", "google"))
        .denial?.requiredPlan,
    ).toBe("standard");
  });

  it("allows reconnect of an existing service without consuming another slot", async () => {
    await setPlan("user_light_re", "light");
    seedConnected("user_light_re", "x", "re");
    expect(
      (await evaluateExternalServiceConnectAccess("user_light_re", "x")).denial,
    ).toBeNull();
    expect(
      (await evaluateExternalServiceConnectAccess("user_light_re", "dropbox"))
        .denial,
    ).not.toBeNull();
  });

  it("unlinks X and does not keep usable tokens", async () => {
    seedConnected("user_unlink", "x", "gone");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const disconnected = await disconnectXAccount("user_unlink");
    expect(disconnected.status).toBe("disconnected");
    expect(getExternalServiceCredentials("user_unlink", "x")).toBeNull();
    expect(await getXAccountAccessTokenResult("user_unlink")).toEqual({
      status: "missing",
    });
    expect(JSON.stringify(disconnected)).not.toMatch(/access_|refresh_/);
  });

  it("expired X refresh fails closed for that user only", async () => {
    seedConnected("user_exp_a", "x", "alive");
    saveExternalServiceCredentials({
      userId: "user_exp_b",
      serviceId: "x",
      accessToken: "expired_b",
      refreshToken: "refresh_dead_b",
      expiresAt: new Date(Date.now() - 120_000).toISOString(),
      scope: "tweet.write",
      updatedAt: new Date().toISOString(),
    });
    saveExternalServiceConnection("user_exp_b", {
      ...getExternalServiceConnection("user_exp_b", "x"),
      status: "connected",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid_grant", { status: 400 })),
    );

    const failed = await getXAccountAccessTokenResult("user_exp_b");
    expect(failed.status).toBe("refresh_failed");
    expect(getExternalServiceConnection("user_exp_b", "x").status).toBe(
      "error",
    );
    expect(await getXAccountAccessTokenResult("user_exp_a")).toEqual({
      status: "ready",
      accessToken: "access_alive",
    });
  });

  it("requires production X and Dropbox redirect URIs (no Host derivation)", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() =>
      getXRedirectUri("https://evil.example"),
    ).toThrow(/X_REDIRECT_URI/);
    expect(() =>
      getDropboxRedirectUri("https://evil.example"),
    ).toThrow(/DROPBOX_REDIRECT_URI/);

    vi.stubEnv("X_REDIRECT_URI", "https://atlasapp.jp/api/external-services/x/oauth/callback");
    vi.stubEnv(
      "DROPBOX_REDIRECT_URI",
      "https://atlasapp.jp/api/external-services/dropbox/oauth/callback",
    );
    expect(getXRedirectUri("https://evil.example")).toBe(
      "https://atlasapp.jp/api/external-services/x/oauth/callback",
    );
    expect(getDropboxRedirectUri("https://evil.example")).toBe(
      "https://atlasapp.jp/api/external-services/dropbox/oauth/callback",
    );
  });

  it("allows Dropbox reconnect from the manager and never returns tokens", async () => {
    seedConnected("user_dbx_re", "dropbox", "dbx");
    const result = await externalServiceManager.connect(
      "user_dbx_re",
      "dropbox",
      "http://localhost:3000",
      buildFeatureAccessContext(null),
    );
    expect(result.authorizeUrl).toContain("dropbox.com/oauth2/authorize");
    expect(result.message).toContain("再認証");
    expect(JSON.stringify(result)).not.toMatch(/access_dbx|refresh_dbx/);
  });

  it("deleting credentials stops later token resolution", async () => {
    seedConnected("user_del", "google", "g1");
    deleteExternalServiceCredentials("user_del", "google");
    expect(await getGoogleAccountAccessTokenResult("user_del")).toEqual({
      status: "missing",
    });
  });
});
