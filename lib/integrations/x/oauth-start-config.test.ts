import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getXRedirectUri } from "./config";
import {
  EXPECTED_X_PRODUCTION_REDIRECT_URI,
  X_CONNECT_USER_CONFIG_MESSAGE,
  classifyXConnectStartError,
  inspectXConnectStartReadiness,
  inspectXOAuthEnvFlags,
  probeXOAuthConnectConfig,
} from "./oauth-start-config";
import { buildXAuthorizeUrl } from "./oauth";
import { formatExternalConnectClientError } from "@/lib/integrations/external-services/client";
import {
  classifyConnectFailure,
  logExternalConnectFailure,
  sanitizeConnectErrorMessage,
} from "@/lib/integrations/external-services/connect-diagnostics";

describe("X OAuth start config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports configured flags only and never echoes secret values", () => {
    vi.stubEnv("X_CLIENT_ID", "x-client-id-secretish");
    vi.stubEnv("X_CLIENT_SECRET", "x-client-secret-super");
    vi.stubEnv("X_REDIRECT_URI", EXPECTED_X_PRODUCTION_REDIRECT_URI);
    vi.stubEnv("CLERK_SECRET_KEY", "sk_clerk_super_secret");

    const flags = inspectXOAuthEnvFlags();
    expect(flags).toEqual({
      xClientIdConfigured: true,
      xClientSecretConfigured: true,
      xRedirectUriConfigured: true,
      oauthStateSecretConfigured: true,
    });
    const serialized = JSON.stringify(flags);
    expect(serialized).not.toContain("x-client-id-secretish");
    expect(serialized).not.toContain("x-client-secret-super");
    expect(serialized).not.toContain("sk_clerk_super_secret");
  });

  it("fail-closes when X_CLIENT_SECRET is missing", () => {
    const readiness = inspectXConnectStartReadiness({
      VERCEL_ENV: "production",
      X_CLIENT_ID: "id",
      X_CLIENT_SECRET: "",
      X_REDIRECT_URI: EXPECTED_X_PRODUCTION_REDIRECT_URI,
      CLERK_SECRET_KEY: "sk",
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.developerCode).toBe("x_client_secret_missing");
    expect(
      classifyXConnectStartError(
        new Error("X_CLIENT_SECRET is not configured. Add it to .env.local to connect X."),
      ).developerCode,
    ).toBe("x_client_secret_missing");
  });

  it("classifies missing X_CLIENT_ID as 503 without leaking the env value", () => {
    const classified = classifyXConnectStartError(
      new Error("X_CLIENT_ID is not configured. Add it to .env.local to connect X."),
    );
    expect(classified.developerCode).toBe("x_client_id_missing");
    expect(classified.httpStatus).toBe(503);
    expect(classified.userMessage).toBe(X_CONNECT_USER_CONFIG_MESSAGE);

    const readiness = inspectXConnectStartReadiness({
      X_CLIENT_ID: "",
      X_CLIENT_SECRET: "secret",
      X_REDIRECT_URI: EXPECTED_X_PRODUCTION_REDIRECT_URI,
      CLERK_SECRET_KEY: "sk",
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.developerCode).toBe("x_client_id_missing");
    expect(JSON.stringify(readiness)).not.toContain("secret");
  });

  it("allows Vercel Production start when redirect env is unset", () => {
    const probe = probeXOAuthConnectConfig({
      VERCEL_ENV: "production",
      X_CLIENT_ID: "id",
      X_CLIENT_SECRET: "secret",
      CLERK_SECRET_KEY: "sk",
    });
    expect(probe.flags.xRedirectUriConfigured).toBe(false);
    expect(probe.usingCanonicalProductionRedirect).toBe(true);
    expect(probe.canStartAuthorize).toBe(true);
    expect(probe.expectedRedirectUri).toBe(EXPECTED_X_PRODUCTION_REDIRECT_URI);
    expect(JSON.stringify(probe)).not.toContain("secret");
  });

  it("builds authorize URL with PKCE on Vercel Production without X_REDIRECT_URI", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("X_CLIENT_ID", "atlas-x-client");
    vi.stubEnv("X_CLIENT_SECRET", "");
    vi.stubEnv("X_REDIRECT_URI", "");
    vi.stubEnv("X_OAUTH_REDIRECT_URI", "");
    vi.stubEnv("OAUTH_STATE_SECRET", "oauth-state-secret-for-test");

    const url = buildXAuthorizeUrl("https://evil.example", "user_x_connect", {
      returnTo: "/workspace/x",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://twitter.com/i/oauth2/authorize",
    );
    expect(parsed.searchParams.get("client_id")).toBe("atlas-x-client");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      EXPECTED_X_PRODUCTION_REDIRECT_URI,
    );
    expect(parsed.searchParams.get("code_challenge")).toBeTruthy();
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBeTruthy();
    expect(url).not.toContain("evil.example");
  });

  it("sanitizes connect errors so secrets never enter the log payload", () => {
    const error = new Error(
      "token=ya29.fake_oauth_access_token_value password=wp-app-pass X_CLIENT_SECRET=supersecret",
    );
    const sanitized = sanitizeConnectErrorMessage(error);
    expect(sanitized).not.toContain("ya29.fake_oauth_access_token_value");
    expect(sanitized).not.toContain("wp-app-pass");
    expect(sanitized).not.toContain("supersecret");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logExternalConnectFailure({
      diagnosticId: "p5_extconnect_test",
      serviceId: "x",
      failedStage: "oauth_url",
      developerCode: "x_connect_unclassified",
      error,
    });
    const logged = spy.mock.calls.map((call) => JSON.stringify(call)).join("\n");
    expect(logged).toContain("p5_extconnect_test");
    expect(logged).toContain("oauth_url");
    expect(logged).not.toContain("supersecret");
    expect(logged).not.toContain("wp-app-pass");
    expect(logged).not.toContain("ya29.fake_oauth_access_token_value");
  });

  it("surfaces diagnosticId on the client without English fallback", () => {
    expect(
      formatExternalConnectClientError({
        error: X_CONNECT_USER_CONFIG_MESSAGE,
        diagnosticId: "p5_extconnect_abc",
      }),
    ).toContain("診断ID: p5_extconnect_abc");
    expect(
      formatExternalConnectClientError(null),
    ).toMatch(/自動で再試行/);
    expect(classifyConnectFailure("x", new Error("X_CLIENT_ID missing")).httpStatus).toBe(
      503,
    );
  });

  it("does not derive X redirect from Host when env is set", () => {
    vi.stubEnv("X_REDIRECT_URI", EXPECTED_X_PRODUCTION_REDIRECT_URI);
    expect(getXRedirectUri("https://evil.example")).toBe(
      EXPECTED_X_PRODUCTION_REDIRECT_URI,
    );
  });
});
