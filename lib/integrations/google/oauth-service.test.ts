import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteExternalServiceCredentials,
  getExternalServiceCredentials,
  resetExternalServiceCredentialStore,
} from "@/lib/integrations/external-services/credential-store";
import {
  getExternalServiceConnection,
  resetExternalServiceStore,
} from "@/lib/integrations/external-services/store";
import {
  completeGoogleAccountOAuth,
  disconnectGoogleAccount,
} from "@/lib/integrations/google/oauth-service";

const TEST_USER_ID = "user_google_oauth_test";

describe("Google account OAuth service", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("completes OAuth and stores credentials without exposing tokens in connection", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-token-123",
            refresh_token: "refresh-token-456",
            expires_in: 3600,
            scope: "email profile",
            token_type: "Bearer",
          }),
          { status: 200 },
        );
      }

      if (url.includes("googleapis.com/oauth2/v2/userinfo")) {
        return new Response(
          JSON.stringify({
            id: "google-user-1",
            email: "user@example.com",
            name: "Test User",
            picture: "https://example.com/avatar.png",
          }),
          { status: 200 },
        );
      }

      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const connection = await completeGoogleAccountOAuth(
      TEST_USER_ID,
      "auth-code",
      "http://localhost:3000",
    );

    expect(connection.status).toBe("connected");
    expect(connection.account).toEqual({
      email: "user@example.com",
      name: "Test User",
      pictureUrl: "https://example.com/avatar.png",
    });
    expect(connection).not.toHaveProperty("accessToken");

    const credentials = getExternalServiceCredentials(TEST_USER_ID, "google");
    expect(credentials?.accessToken).toBe("access-token-123");
    expect(credentials?.refreshToken).toBe("refresh-token-456");
    expect(credentials?.expiresAt).toBeTruthy();

    expect(getExternalServiceConnection(TEST_USER_ID, "google").status).toBe(
      "connected",
    );
  });

  it("disconnects and clears stored credentials", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-token-123",
            refresh_token: "refresh-token-456",
            expires_in: 3600,
            scope: "email profile",
            token_type: "Bearer",
          }),
          { status: 200 },
        );
      }

      if (url.includes("googleapis.com/oauth2/v2/userinfo")) {
        return new Response(
          JSON.stringify({
            id: "google-user-1",
            email: "user@example.com",
            name: "Test User",
          }),
          { status: 200 },
        );
      }

      if (url.includes("oauth2.googleapis.com/revoke")) {
        return new Response(null, { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await completeGoogleAccountOAuth(TEST_USER_ID, "auth-code", "http://localhost:3000");

    const disconnected = await disconnectGoogleAccount(TEST_USER_ID);

    expect(disconnected.status).toBe("disconnected");
    expect(disconnected.account).toBeUndefined();
    expect(getExternalServiceCredentials(TEST_USER_ID, "google")).toBeNull();
    expect(deleteExternalServiceCredentials(TEST_USER_ID, "google")).toBe(false);
  });

  it("requires a refresh token from Google", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-only",
            expires_in: 3600,
            scope: "email profile",
            token_type: "Bearer",
          }),
          { status: 200 },
        );
      }

      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeGoogleAccountOAuth(TEST_USER_ID, "auth-code", "http://localhost:3000"),
    ).rejects.toThrow(/refresh token/i);
  });
});

describe("Google account access token refresh", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refreshes expired access tokens", async () => {
    const { saveExternalServiceCredentials } = await import(
      "@/lib/integrations/external-services/credential-store"
    );
    const { saveExternalServiceConnection, getExternalServiceConnection } =
      await import("@/lib/integrations/external-services/store");
    const { getGoogleAccountAccessTokenResult } = await import(
      "@/lib/integrations/google/token-manager"
    );

    const connection = getExternalServiceConnection(TEST_USER_ID, "google");
    saveExternalServiceConnection(TEST_USER_ID, {
      ...connection,
      status: "connected",
      connectedAt: new Date().toISOString(),
    });
    saveExternalServiceCredentials({
      userId: TEST_USER_ID,
      serviceId: "google",
      accessToken: "old-access",
      refreshToken: "refresh-token-456",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      scope: "https://www.googleapis.com/auth/gmail.modify",
      updatedAt: new Date().toISOString(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "new-access",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/gmail.modify",
          token_type: "Bearer",
        }),
      ),
    );

    const result = await getGoogleAccountAccessTokenResult(TEST_USER_ID);
    expect(result).toEqual({ status: "ready", accessToken: "new-access" });
  });

  it("marks connection for reconnect when refresh fails", async () => {
    const { saveExternalServiceCredentials } = await import(
      "@/lib/integrations/external-services/credential-store"
    );
    const { saveExternalServiceConnection, getExternalServiceConnection } =
      await import("@/lib/integrations/external-services/store");
    const { getGoogleAccountAccessTokenResult } = await import(
      "@/lib/integrations/google/token-manager"
    );

    const connection = getExternalServiceConnection(TEST_USER_ID, "google");
    saveExternalServiceConnection(TEST_USER_ID, {
      ...connection,
      status: "connected",
      connectedAt: new Date().toISOString(),
    });
    saveExternalServiceCredentials({
      userId: TEST_USER_ID,
      serviceId: "google",
      accessToken: "old-access",
      refreshToken: "bad-refresh",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      scope: "https://www.googleapis.com/auth/gmail.modify",
      updatedAt: new Date().toISOString(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "invalid_grant", error_description: "Token has been expired or revoked." },
          { status: 400 },
        ),
      ),
    );

    const result = await getGoogleAccountAccessTokenResult(TEST_USER_ID);
    expect(result.status).toBe("refresh_failed");
    expect(getExternalServiceConnection(TEST_USER_ID, "google").status).toBe(
      "error",
    );
  });
});
