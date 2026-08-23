/**
 * Permanent CI guard: Google reconnect must not use a stale isolate token.
 * Same class as X #365.
 *
 * CASE A: durable reload overwrites stale memory access token
 * CASE B: other user's credentials are not read
 * CASE C: decode-failed durable clears stale memory token
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/billing/access", () => ({
  getBillingFeatureDenial: vi.fn(async () => null),
}));

const durableByUser = vi.hoisted(() => new Map<string, unknown>());
const durableReadFailed = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/integrations/google/credential-persistence", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/google/credential-persistence")
  >("@/lib/integrations/google/credential-persistence");
  return {
    ...actual,
    readGoogleAuthFromDurable: vi.fn(async (userId: string) => {
      if (durableReadFailed.has(userId)) {
        return {
          status: "unavailable" as const,
          developerCode: "durable_read_failed" as const,
          reason: "timeout",
        };
      }
      const row = durableByUser.get(userId) as
        | { decodeFailed?: boolean; credentials?: unknown }
        | undefined;
      if (!row) return { status: "missing" as const };
      if (row.decodeFailed || !row.credentials) {
        return {
          status: "unavailable" as const,
          developerCode: "durable_read_failed" as const,
          reason: "row_unreadable",
        };
      }
      return { status: "found" as const, value: row };
    }),
    loadGoogleAuthFromSupabase: vi.fn(async (userId: string) => {
      return durableByUser.get(userId) ?? null;
    }),
    persistGoogleAuthToSupabase: vi.fn(async () => true),
  };
});

import {
  getExternalServiceCredentials,
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import {
  resetExternalAuthHydration,
} from "@/lib/integrations/external-services/durable";
import {
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import { googleServiceDefinition } from "@/lib/integrations/google/definition";
import { requireGoogleIntegrationAccess } from "@/lib/integrations/google/require-access";
import { getGoogleAccountAccessTokenResult } from "@/lib/integrations/google/token-manager";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";

const USER_A = "user_google_stale_a";
const USER_B = "user_google_stale_b";

function connectedGoogle(userId: string, accessToken: string) {
  return {
    credentials: {
      userId,
      serviceId: "google" as const,
      accessToken,
      refreshToken: `${accessToken}-refresh`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: "https://www.googleapis.com/auth/calendar.events",
      updatedAt: new Date().toISOString(),
    },
    connection: {
      ...createDefaultConnection(googleServiceDefinition),
      status: "connected" as const,
      connectedAt: new Date().toISOString(),
      lastUsedAt: null,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
      features: [...googleServiceDefinition.plannedFeatures],
      errorMessage: null,
      account: {
        email: `${userId}@example.com`,
        name: "A",
        pictureUrl: null,
        username: userId,
      },
    },
  };
}

describe("Google reconnect stale token (permanent)", () => {
  beforeEach(() => {
    durableByUser.clear();
    durableReadFailed.clear();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
    resetFeatureFlagStore();
    setFeatureFlagState("google", "on");
  });

  afterEach(() => {
    durableByUser.clear();
    durableReadFailed.clear();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
  });

  it("CASE A: post-reconnect token comes from durable, not isolate memory", async () => {
    const stale = connectedGoogle(USER_A, "stale-google-access");
    saveExternalServiceCredentials(stale.credentials);
    saveExternalServiceConnection(USER_A, stale.connection);

    const fresh = connectedGoogle(USER_A, "fresh-google-access");
    durableByUser.set(USER_A, fresh);

    const result = await getGoogleAccountAccessTokenResult(USER_A);
    expect(result).toEqual({
      status: "ready",
      accessToken: "fresh-google-access",
    });
    expect(getExternalServiceCredentials(USER_A, "google")?.accessToken).toBe(
      "fresh-google-access",
    );
  });

  it("CASE B: other user's durable token is not used", async () => {
    const a = connectedGoogle(USER_A, "a-access");
    const b = connectedGoogle(USER_B, "b-access");
    durableByUser.set(USER_A, a);
    durableByUser.set(USER_B, b);
    saveExternalServiceCredentials(a.credentials);
    saveExternalServiceCredentials(b.credentials);

    const result = await getGoogleAccountAccessTokenResult(USER_A);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.accessToken).toBe("a-access");
      expect(result.accessToken).not.toBe("b-access");
    }
  });

  it("CASE C: decode-failed durable does not use the stale memory token", async () => {
    const stale = connectedGoogle(USER_A, "stale-google-access");
    saveExternalServiceCredentials(stale.credentials);
    saveExternalServiceConnection(USER_A, stale.connection);
    durableByUser.set(USER_A, {
      credentials: null,
      decodeFailed: true,
      connection: {
        ...stale.connection,
        status: "error",
        errorMessage: "Google連携の認証情報を読み取れませんでした。再接続してください",
      },
    });

    const result = await getGoogleAccountAccessTokenResult(USER_A);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.developerCode).toBe("durable_read_failed");
    }
    expect(result.status).not.toBe("ready");
  });

  it("CASE D: disconnect on another isolate does not use stale Google token", async () => {
    const stale = connectedGoogle(USER_A, "stale-google-access");
    saveExternalServiceCredentials(stale.credentials);
    saveExternalServiceConnection(USER_A, stale.connection);
    durableByUser.set(USER_A, stale);
    durableByUser.delete(USER_A);

    const result = await getGoogleAccountAccessTokenResult(USER_A);
    expect(result.status).toBe("missing");
    expect(getExternalServiceCredentials(USER_A, "google")).toBeNull();

    const gate = await requireGoogleIntegrationAccess({
      userId: USER_A,
      context: buildFeatureAccessContext("owner@example.com"),
      capability: "calendar",
    });
    expect(gate).toMatchObject({ status: "google_not_connected" });
  });

  it("CASE E: durable read failure is not google_not_connected", async () => {
    const stale = connectedGoogle(USER_A, "stale-google-access");
    saveExternalServiceCredentials(stale.credentials);
    saveExternalServiceConnection(USER_A, stale.connection);
    durableByUser.set(USER_A, stale);
    durableReadFailed.add(USER_A);

    const result = await getGoogleAccountAccessTokenResult(USER_A);
    expect(result.status).toBe("unavailable");
    expect(getExternalServiceCredentials(USER_A, "google")?.accessToken).toBe(
      "stale-google-access",
    );

    const gate = await requireGoogleIntegrationAccess({
      userId: USER_A,
      context: buildFeatureAccessContext("owner@example.com"),
      capability: "calendar",
    });
    expect(gate).toMatchObject({
      status: "durable_unavailable",
      developerCode: "durable_read_failed",
    });
  });
});
