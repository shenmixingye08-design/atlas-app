/**
 * Google Integration credential stability regression.
 *
 * Production symptom: Google login works and Calendar UI opens, but
 * Integration repeatedly shows 未接続 after a successful connect.
 *
 * Root causes fixed here:
 * 1. Calendar/Gmail/Drive gated on in-memory connection.status BEFORE hydrate
 *    (cold serverless instance → default disconnected → never read Supabase).
 * 2. Decrypt failure returned null → UI treated as plain 未接続.
 *
 * Clerk Google login ≠ Integration OAuth credentials.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/billing/access", () => ({
  getBillingFeatureDenial: vi.fn(async () => null),
}));

vi.mock("@/lib/integrations/google/oauth", () => ({
  refreshGoogleAccountAccessToken: vi.fn(),
  exchangeGoogleAccountAuthCode: vi.fn(),
  fetchGoogleAccountUserInfo: vi.fn(),
  revokeGoogleAccountToken: vi.fn(),
  buildGoogleAccountAuthorizeUrl: vi.fn(() => "https://accounts.google.com"),
}));

vi.mock("@/lib/integrations/google/credential-persistence", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/google/credential-persistence")
  >("@/lib/integrations/google/credential-persistence");
  return {
    ...actual,
    loadGoogleAuthFromSupabase: vi.fn(actual.loadGoogleAuthFromSupabase),
    persistGoogleAuthToSupabase: vi.fn(async () => true),
  };
});

import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  resetExternalServiceCredentialStore,
  getExternalServiceCredentials,
  saveExternalServiceCredentials,
  listExternalServiceCredentialsForUser,
} from "@/lib/integrations/external-services/credential-store";
import {
  getExternalServiceConnection,
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import {
  ensureExternalAuthHydrated,
  resetExternalAuthHydration,
} from "@/lib/integrations/external-services/durable";
import { googleServiceDefinition } from "@/lib/integrations/google/definition";
import { requireGoogleIntegrationAccess } from "@/lib/integrations/google/require-access";
import { getGoogleAccountAccessTokenResult } from "@/lib/integrations/google/token-manager";
import { refreshGoogleAccountAccessToken } from "@/lib/integrations/google/oauth";
import {
  GOOGLE_CREDENTIAL_DECODE_FAILED_MESSAGE,
  loadGoogleAuthFromSupabase,
} from "@/lib/integrations/google/credential-persistence";
import { encryptOAuthSecret } from "@/lib/integrations/oauth-crypto/crypto";

const USER_A = "user_google_stable_a";
const USER_B = "user_google_stable_b";
const ownerContext = buildFeatureAccessContext("owner@example.com");

const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly openid email profile";

const loadGoogleAuthFromSupabaseMock = vi.mocked(loadGoogleAuthFromSupabase);

function connectedConnection(email = "a@example.com") {
  return {
    ...createDefaultConnection(googleServiceDefinition),
    status: "connected" as const,
    connectedAt: new Date().toISOString(),
    lastUsedAt: null,
    scopes: CALENDAR_SCOPE.split(" "),
    features: [...googleServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: { email, name: "A", pictureUrl: null },
  };
}

function saveConnected(userId: string, opts?: { expiresAt?: string }) {
  saveExternalServiceCredentials({
    userId,
    serviceId: "google",
    accessToken: `access-${userId}`,
    refreshToken: `refresh-${userId}`,
    expiresAt:
      opts?.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
    scope: CALENDAR_SCOPE,
    updatedAt: new Date().toISOString(),
  });
  saveExternalServiceConnection(userId, connectedConnection());
}

describe("Google Integration credential stability", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
    resetFeatureFlagStore();
    setFeatureFlagState("google", "on");
    vi.stubEnv(
      "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_VERSION", "1");
    loadGoogleAuthFromSupabaseMock.mockReset();
    loadGoogleAuthFromSupabaseMock.mockResolvedValue(null);
    vi.mocked(refreshGoogleAccountAccessToken).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("1-4: cold instance hydrates connected from durable store (reload/relogin safe)", async () => {
    const creds = {
      userId: USER_A,
      serviceId: "google" as const,
      accessToken: "access-from-db",
      refreshToken: "refresh-from-db",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      scope: CALENDAR_SCOPE,
      updatedAt: new Date().toISOString(),
    };
    const conn = connectedConnection();

    // Cold start — memory empty.
    expect(getExternalServiceConnection(USER_A, "google").status).toBe(
      "disconnected",
    );

    loadGoogleAuthFromSupabaseMock.mockResolvedValue({
      credentials: creds,
      connection: conn,
    });

    const gate = await requireGoogleIntegrationAccess({
      userId: USER_A,
      context: ownerContext,
      capability: "calendar",
    });
    expect(gate).toMatchObject({ accessToken: "access-from-db" });
    expect(getExternalServiceConnection(USER_A, "google").status).toBe(
      "connected",
    );
  });

  it("5-7: expired access token refreshes and keeps refresh token", async () => {
    saveConnected(USER_A, {
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const priorRefresh = getExternalServiceCredentials(USER_A, "google")!
      .refreshToken;

    // Already in memory — hydrate returns null (no overwrite).
    loadGoogleAuthFromSupabaseMock.mockResolvedValue(null);

    vi.mocked(refreshGoogleAccountAccessToken).mockResolvedValueOnce({
      access_token: "new-access-token",
      expires_in: 3600,
      scope: CALENDAR_SCOPE,
      token_type: "Bearer",
    });

    const result = await getGoogleAccountAccessTokenResult(USER_A);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.accessToken).toBe("new-access-token");

    const next = getExternalServiceCredentials(USER_A, "google");
    expect(next?.refreshToken).toBe(priorRefresh);
    expect(getExternalServiceConnection(USER_A, "google").status).toBe(
      "connected",
    );
  });

  it("8: decrypt failure is explicit error (not silent disconnected)", async () => {
    loadGoogleAuthFromSupabaseMock.mockResolvedValue({
      credentials: null,
      decodeFailed: true,
      connection: {
        ...connectedConnection(),
        status: "error",
        errorMessage: GOOGLE_CREDENTIAL_DECODE_FAILED_MESSAGE,
      },
    });

    await ensureExternalAuthHydrated(USER_A);
    const status = getExternalServiceConnection(USER_A, "google");
    expect(status.status).toBe("error");
    expect(status.errorMessage).toMatch(/再接続/);
    expect(status.status).not.toBe("disconnected");

    resetExternalAuthHydration();
    const gate = await requireGoogleIntegrationAccess({
      userId: USER_A,
      context: ownerContext,
      capability: "calendar",
    });
    expect(gate).toMatchObject({ status: "needs_reconnect" });
  });

  it("9: does not return another user's credentials", async () => {
    saveConnected(USER_A);
    saveConnected(USER_B);

    const a = getExternalServiceCredentials(USER_A, "google");
    const b = getExternalServiceCredentials(USER_B, "google");
    expect(a?.accessToken).toBe(`access-${USER_A}`);
    expect(b?.accessToken).toBe(`access-${USER_B}`);
    expect(a?.refreshToken).not.toBe(b?.refreshToken);

    const onlyA = listExternalServiceCredentialsForUser(USER_A);
    expect(onlyA.every((row) => row.userId === USER_A)).toBe(true);
  });

  it("10: hydrate-first prevents false 未接続 on cold gate", async () => {
    const creds = {
      userId: USER_A,
      serviceId: "google" as const,
      accessToken: "hydrated-access",
      refreshToken: "hydrated-refresh",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      scope: CALENDAR_SCOPE,
      updatedAt: new Date().toISOString(),
    };

    expect(getExternalServiceConnection(USER_A, "google").status).toBe(
      "disconnected",
    );

    loadGoogleAuthFromSupabaseMock.mockResolvedValue({
      credentials: creds,
      connection: connectedConnection(),
    });

    const gate = await requireGoogleIntegrationAccess({
      userId: USER_A,
      context: ownerContext,
      capability: "calendar",
    });
    expect(gate).toEqual({ accessToken: "hydrated-access" });
  });

  it("encrypt round-trip does not store plaintext tokens", () => {
    const access = encryptOAuthSecret("ya29.test-access");
    const refresh = encryptOAuthSecret("1//test-refresh");
    expect(access.ciphertext.startsWith("enc:v")).toBe(true);
    expect(refresh.ciphertext.startsWith("enc:v")).toBe(true);
    expect(access.ciphertext).not.toContain("ya29.test-access");
    expect(refresh.ciphertext).not.toContain("1//test-refresh");
  });
});
