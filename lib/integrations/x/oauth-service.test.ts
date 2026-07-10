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
  completeXAccountOAuth,
  disconnectXAccount,
} from "@/lib/integrations/x/oauth-service";
import {
  generatePkceCodeChallenge,
  generatePkceCodeVerifier,
} from "@/lib/integrations/x/pkce";
import {
  consumeXOAuthState,
  createXOAuthState,
  resetXOAuthStateStore,
} from "@/lib/integrations/x/oauth-state";

const TEST_USER_ID = "user_x_oauth_test";

describe("X OAuth PKCE", () => {
  it("generates verifier and S256 challenge", () => {
    const verifier = generatePkceCodeVerifier();
    const challenge = generatePkceCodeChallenge(verifier);

    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).not.toBe(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("stores and consumes oauth state with code verifier", () => {
    resetXOAuthStateStore();
    const verifier = generatePkceCodeVerifier();
    const state = createXOAuthState(TEST_USER_ID, verifier);
    const payload = consumeXOAuthState(state);

    expect(payload).toEqual({ userId: TEST_USER_ID, codeVerifier: verifier });
    expect(consumeXOAuthState(state)).toBeNull();
  });
});

describe("X account OAuth service", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetXOAuthStateStore();
    vi.stubEnv("X_CLIENT_ID", "test-x-client-id");
    vi.stubEnv("X_CLIENT_SECRET", "test-x-client-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("completes OAuth and stores credentials without exposing tokens in connection", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("api.twitter.com/2/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "x-access-token",
            refresh_token: "x-refresh-token",
            expires_in: 7200,
            scope: "tweet.read tweet.write users.read offline.access",
            token_type: "bearer",
          }),
          { status: 200 },
        );
      }

      if (url.includes("api.twitter.com/2/users/me")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "123456789",
              username: "atlas_user",
              name: "ATLAS User",
              profile_image_url: "https://pbs.twimg.com/profile.png",
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const connection = await completeXAccountOAuth(
      TEST_USER_ID,
      "auth-code",
      "test-code-verifier",
      "http://localhost:3000",
    );

    expect(connection.status).toBe("connected");
    expect(connection.account).toMatchObject({
      email: "@atlas_user",
      name: "ATLAS User",
      pictureUrl: "https://pbs.twimg.com/profile.png",
      providerUserId: "123456789",
      username: "atlas_user",
    });
    expect(connection.connectedAt).toBeTruthy();

    const credentials = getExternalServiceCredentials(TEST_USER_ID, "x");
    expect(credentials?.accessToken).toBe("x-access-token");
    expect(credentials?.refreshToken).toBe("x-refresh-token");
    expect(credentials?.expiresAt).toBeTruthy();
  });

  it("disconnects and clears credentials", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.twitter.com/2/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "x-access-token",
            refresh_token: "x-refresh-token",
            expires_in: 7200,
          }),
          { status: 200 },
        );
      }
      if (url.includes("api.twitter.com/2/users/me")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "1",
              username: "user",
              name: "User",
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("oauth2/revoke")) {
        return new Response(null, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await completeXAccountOAuth(
      TEST_USER_ID,
      "auth-code",
      "verifier",
      "http://localhost:3000",
    );

    const disconnected = await disconnectXAccount(TEST_USER_ID);
    expect(disconnected.status).toBe("disconnected");
    expect(getExternalServiceCredentials(TEST_USER_ID, "x")).toBeNull();
    expect(getExternalServiceConnection(TEST_USER_ID, "x").status).toBe(
      "disconnected",
    );
  });
});
