/**
 * Permanent CI guard: X OAuth start must stay independent of other
 * integrations. If a future Google / Dropbox / WordPress change blocks
 * X connect, these cases must fail the Quality Gate.
 *
 * CASE A: WP encryption key unset → X connect 200 + authorizationUrl
 * CASE B: WP credential load throws → X connect is not 500
 * CASE C: Google / Dropbox incomplete → X start still succeeds
 * CASE D: only X env healthy → authorizationUrl returned
 * CASE E: X_CLIENT_ID / X_CLIENT_SECRET / X_REDIRECT_URI gaps fail-closed
 *         as X's own 503 (not a generic 500, not a WP/Google error)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

const loaders = vi.hoisted(() => ({
  google: vi.fn(),
  x: vi.fn(),
  dropbox: vi.fn(),
  wordpress: vi.fn(),
  durableDomain: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => null,
}));

vi.mock("@/lib/integrations/google/credential-persistence", () => ({
  loadGoogleAuthFromSupabase: (...args: unknown[]) => loaders.google(...args),
}));

vi.mock("@/lib/integrations/x/credential-persistence", () => ({
  loadXAuthFromSupabase: (...args: unknown[]) => loaders.x(...args),
}));

vi.mock("@/lib/integrations/dropbox/credential-persistence", () => ({
  loadDropboxAuthFromSupabase: (...args: unknown[]) => loaders.dropbox(...args),
}));

vi.mock("@/lib/integrations/wordpress/credential-persistence", () => ({
  loadWordPressAuthFromSupabase: (...args: unknown[]) =>
    loaders.wordpress(...args),
}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  loadDurableDomain: (...args: unknown[]) => loaders.durableDomain(...args),
  persistDurableDomain: vi.fn(),
}));

vi.mock("@/lib/feature-flags/resolve-context", () => ({
  resolveFeatureAccessContext: vi.fn(async () =>
    (await import("@/lib/feature-flags/access")).buildFeatureAccessContext(null),
  ),
}));

vi.mock("@/lib/integrations/external-services/connect-access", () => ({
  evaluateExternalServiceConnectAccess: vi.fn(async () => ({ denial: null })),
}));

vi.mock("@/lib/billing/access", () => ({
  billingDenialResponse: vi.fn(),
}));

vi.mock("@/lib/owner/popularity-ranking/telemetry", () => ({
  recordGoogleIntegrationUsage: vi.fn(),
  recordDropboxIntegrationUsage: vi.fn(),
}));

import {
  ensureExternalAuthHydrated,
  resetExternalAuthHydration,
} from "@/lib/integrations/external-services/durable";
import { resetExternalServiceCredentialStore } from "@/lib/integrations/external-services/credential-store";
import { resetExternalServiceStore } from "@/lib/integrations/external-services/store";
import { EXPECTED_X_PRODUCTION_REDIRECT_URI } from "./config";
import { X_CONNECT_USER_CONFIG_MESSAGE } from "./oauth-start-config";

function stubHealthyXOnlyEnv() {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("X_CLIENT_ID", "atlas-x-client");
  vi.stubEnv("X_CLIENT_SECRET", "atlas-x-secret");
  vi.stubEnv("OAUTH_STATE_SECRET", "oauth-state-secret-for-test");
  vi.stubEnv("X_REDIRECT_URI", "");
  vi.stubEnv("X_OAUTH_REDIRECT_URI", "");
  vi.stubEnv("ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY", "");
  vi.stubEnv("GOOGLE_CLIENT_ID", "");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "");
  vi.stubEnv("DROPBOX_APP_KEY", "");
  vi.stubEnv("DROPBOX_APP_SECRET", "");
  vi.stubEnv("DROPBOX_REDIRECT_URI", "");
}

async function postXConnect(userId: string): Promise<Response> {
  authMock.mockResolvedValue({ userId });
  await ensureExternalAuthHydrated(userId);
  const { POST } = await import(
    "@/app/api/external-services/[serviceId]/connect/route"
  );
  return POST(
    new Request("https://atlasapp.jp/api/external-services/x/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnTo: "/workspace/x" }),
    }),
    { params: Promise.resolve({ serviceId: "x" }) },
  );
}

async function readConnectJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("X connect isolation regression (permanent)", () => {
  beforeEach(() => {
    resetExternalAuthHydration();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    authMock.mockReset();
    loaders.google.mockReset().mockResolvedValue(null);
    loaders.x.mockReset().mockResolvedValue(null);
    loaders.dropbox.mockReset().mockResolvedValue(null);
    loaders.wordpress.mockReset().mockResolvedValue(null);
    loaders.durableDomain.mockReset().mockResolvedValue(null);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("CASE A: missing WordPress encryption key still starts X OAuth", async () => {
    stubHealthyXOnlyEnv();
    const response = await postXConnect("user_case_a");
    const body = await readConnectJson(response);
    expect(response.status).toBe(200);
    expect(body.authorizeUrl).toEqual(
      expect.stringContaining("twitter.com/i/oauth2/authorize"),
    );
    expect(String(body.authorizeUrl)).toContain(
      encodeURIComponent(EXPECTED_X_PRODUCTION_REDIRECT_URI),
    );
    expect(JSON.stringify(body)).not.toContain("WORDPRESS");
  });

  it("CASE B: WordPress credential load throw does not 500 X connect", async () => {
    stubHealthyXOnlyEnv();
    loaders.wordpress.mockRejectedValue(
      new Error("ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY missing"),
    );
    const response = await postXConnect("user_case_b");
    const body = await readConnectJson(response);
    expect(response.status).not.toBe(500);
    expect(response.status).toBe(200);
    expect(body.authorizeUrl).toEqual(
      expect.stringContaining("twitter.com/i/oauth2/authorize"),
    );
    expect(loaders.x).toHaveBeenCalledWith("user_case_b");
    expect(loaders.google).toHaveBeenCalled();
    expect(loaders.dropbox).toHaveBeenCalled();
    expect(body.developerCode).toBeUndefined();
  });

  it("CASE C: Google/Dropbox disconnected or incomplete does not block X start", async () => {
    stubHealthyXOnlyEnv();
    loaders.google.mockRejectedValue(new Error("GOOGLE_CLIENT_SECRET missing"));
    loaders.dropbox.mockRejectedValue(new Error("DROPBOX_REDIRECT_URI missing"));
    const response = await postXConnect("user_case_c");
    const body = await readConnectJson(response);
    expect(response.status).toBe(200);
    expect(String(body.authorizeUrl)).toContain("twitter.com/i/oauth2/authorize");
    expect(String(body.authorizeUrl)).toContain("code_challenge");
    expect(JSON.stringify(body)).not.toMatch(/GOOGLE_CLIENT_SECRET|DROPBOX_REDIRECT_URI/);
  });

  it("CASE D: healthy X env alone returns authorizationUrl", async () => {
    stubHealthyXOnlyEnv();
    const response = await postXConnect("user_case_d");
    const body = await readConnectJson(response);
    expect(response.status).toBe(200);
    const url = new URL(String(body.authorizeUrl ?? ""));
    expect(url.host).toBe("twitter.com");
    expect(url.searchParams.get("client_id")).toBe("atlas-x-client");
    expect(url.searchParams.get("redirect_uri")).toBe(
      EXPECTED_X_PRODUCTION_REDIRECT_URI,
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(String(body.authorizeUrl)).not.toMatch(/GOOGLE_|DROPBOX_|WORDPRESS/i);
  });

  it("CASE E: only X env gaps fail-closed as X's own 503", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("OAUTH_STATE_SECRET", "oauth-state-secret-for-test");
    vi.stubEnv("X_CLIENT_ID", "");
    vi.stubEnv("X_CLIENT_SECRET", "atlas-x-secret");
    vi.stubEnv("ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY", "");
    const idMissing = await postXConnect("user_case_e_id");
    const idBody = await readConnectJson(idMissing);
    expect(idMissing.status).toBe(503);
    expect(idMissing.status).not.toBe(500);
    expect(idBody.developerCode).toBe("x_client_id_missing");
    expect(idBody.failedStage).toBe("oauth_url");
    expect(idBody.error).toBe(X_CONNECT_USER_CONFIG_MESSAGE);
    expect(idBody.diagnosticId).toEqual(expect.stringContaining("p5_extconnect_"));
    expect(JSON.stringify(idBody)).not.toContain("atlas-x-secret");

    resetExternalAuthHydration();
    vi.stubEnv("X_CLIENT_ID", "atlas-x-client");
    vi.stubEnv("X_CLIENT_SECRET", "");
    const secretMissing = await postXConnect("user_case_e_secret");
    const secretBody = await readConnectJson(secretMissing);
    expect(secretMissing.status).toBe(503);
    expect(secretBody.developerCode).toBe("x_client_secret_missing");
    expect(secretBody.failedStage).toBe("oauth_url");

    resetExternalAuthHydration();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("X_CLIENT_ID", "atlas-x-client");
    vi.stubEnv("X_CLIENT_SECRET", "atlas-x-secret");
    vi.stubEnv("X_REDIRECT_URI", "");
    vi.stubEnv("X_OAUTH_REDIRECT_URI", "");
    const redirectMissing = await postXConnect("user_case_e_redirect");
    const redirectBody = await readConnectJson(redirectMissing);
    expect(redirectMissing.status).toBe(503);
    expect(redirectBody.developerCode).toBe("x_redirect_uri_missing");
    expect(redirectBody.failedStage).toBe("oauth_url");
    expect(JSON.stringify(redirectBody)).not.toMatch(/wordpress|google|dropbox/i);
  });
});
