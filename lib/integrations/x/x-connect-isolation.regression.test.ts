/**
 * Permanent CI guard: X OAuth start must stay independent of other
 * integrations. If a future Google / Dropbox / WordPress change blocks
 * X connect, these cases must fail the Quality Gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  ensureExternalAuthHydrated,
  resetExternalAuthHydration,
} from "@/lib/integrations/external-services/durable";
import { resetExternalServiceCredentialStore } from "@/lib/integrations/external-services/credential-store";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import { resetExternalServiceStore } from "@/lib/integrations/external-services/store";
import { EXPECTED_X_PRODUCTION_REDIRECT_URI } from "./config";
import {
  classifyXConnectStartError,
  inspectXConnectStartReadiness,
} from "./oauth-start-config";

const ownerContext = buildFeatureAccessContext(null);

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

async function startXConnect(userId: string) {
  await ensureExternalAuthHydrated(userId);
  return externalServiceManager.connect(
    userId,
    "x",
    "https://atlasapp.jp",
    ownerContext,
    { returnTo: "/workspace/x" },
  );
}

describe("X connect isolation regression (permanent)", () => {
  beforeEach(() => {
    resetExternalAuthHydration();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
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
    const result = await startXConnect("user_case_a");
    expect(result.authorizeUrl).toContain("twitter.com/i/oauth2/authorize");
    expect(result.authorizeUrl).toContain(
      encodeURIComponent(EXPECTED_X_PRODUCTION_REDIRECT_URI),
    );
    expect(result.connection.status).toBe("pending");
  });

  it("CASE B: WordPress credential load throw does not 500 X connect", async () => {
    stubHealthyXOnlyEnv();
    loaders.wordpress.mockRejectedValue(
      new Error("ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY missing"),
    );
    const result = await startXConnect("user_case_b");
    expect(result.authorizeUrl).toContain("twitter.com/i/oauth2/authorize");
    expect(loaders.x).toHaveBeenCalledWith("user_case_b");
    expect(loaders.google).toHaveBeenCalled();
    expect(loaders.dropbox).toHaveBeenCalled();
  });

  it("CASE C: Google/Dropbox disconnected or incomplete does not block X start", async () => {
    stubHealthyXOnlyEnv();
    loaders.google.mockRejectedValue(new Error("GOOGLE_CLIENT_SECRET missing"));
    loaders.dropbox.mockRejectedValue(new Error("DROPBOX_REDIRECT_URI missing"));
    const result = await startXConnect("user_case_c");
    expect(result.authorizeUrl).toContain("twitter.com/i/oauth2/authorize");
    expect(result.authorizeUrl).toContain("code_challenge");
  });

  it("CASE D: healthy X env alone returns authorizationUrl", async () => {
    stubHealthyXOnlyEnv();
    const result = await startXConnect("user_case_d");
    const url = new URL(result.authorizeUrl ?? "");
    expect(url.host).toBe("twitter.com");
    expect(url.searchParams.get("client_id")).toBe("atlas-x-client");
    expect(url.searchParams.get("redirect_uri")).toBe(
      EXPECTED_X_PRODUCTION_REDIRECT_URI,
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(result.authorizeUrl).not.toMatch(/GOOGLE_|DROPBOX_|WORDPRESS/i);
  });

  it("CASE E: only X env gaps fail-closed as X's own error", () => {
    const idMissing = inspectXConnectStartReadiness({
      VERCEL_ENV: "production",
      X_CLIENT_SECRET: "secret",
      CLERK_SECRET_KEY: "sk",
    });
    expect(idMissing.ready).toBe(false);
    expect(idMissing.developerCode).toBe("x_client_id_missing");

    const secretMissing = inspectXConnectStartReadiness({
      VERCEL_ENV: "production",
      X_CLIENT_ID: "id",
      CLERK_SECRET_KEY: "sk",
    });
    expect(secretMissing.ready).toBe(false);
    expect(secretMissing.developerCode).toBe("x_client_secret_missing");

    const redirectMissingPreview = inspectXConnectStartReadiness({
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      X_CLIENT_ID: "id",
      X_CLIENT_SECRET: "secret",
      CLERK_SECRET_KEY: "sk",
    });
    expect(redirectMissingPreview.ready).toBe(false);
    expect(redirectMissingPreview.developerCode).toBe("x_redirect_uri_missing");

    expect(
      classifyXConnectStartError(new Error("X_CLIENT_ID is not configured")).httpStatus,
    ).toBe(503);
    expect(
      classifyXConnectStartError(new Error("X_CLIENT_SECRET is not configured"))
        .developerCode,
    ).toBe("x_client_secret_missing");
    expect(JSON.stringify(idMissing)).not.toContain("secret");
  });
});
