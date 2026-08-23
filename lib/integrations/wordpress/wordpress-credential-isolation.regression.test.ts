/**
 * Permanent CI guard: WordPress encryption/config failure is a WordPress-only
 * failure domain. Google / X / LINE / billing / non-WP automation / catalog
 * must not load or decrypt WordPress credentials.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/billing/access", () => ({
  getBillingFeatureDenial: vi.fn(async () => null),
}));

import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { getBillingFeatureDenial } from "@/lib/billing/access";
import {
  ensureExternalAuthHydrated,
  resetExternalAuthHydration,
} from "@/lib/integrations/external-services/durable";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import {
  resetExternalServiceStore,
  saveExternalServiceConnection,
  getExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import {
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import { googleServiceDefinition } from "@/lib/integrations/google/definition";
import { requireGoogleIntegrationAccess } from "@/lib/integrations/google/require-access";
import { xServiceDefinition } from "@/lib/integrations/x/definition";
import { getXAccountAccessTokenResult } from "@/lib/integrations/x/token-manager";
import * as wordpressPersistence from "@/lib/integrations/wordpress/credential-persistence";
import {
  resetWordPressConfigurationLogForTests,
  WORDPRESS_CONFIGURATION_ERROR_LABEL,
} from "@/lib/integrations/wordpress/configuration-log";
import { resetWordPressCredentialStore } from "@/lib/integrations/wordpress/credential-store";
import { createWordPressPostForUser } from "@/lib/integrations/wordpress/post/service";
import { connectWordPressAccount } from "@/lib/integrations/wordpress/connection-service";
import { WP_MISSING_ENCRYPTION_KEY_MESSAGE } from "@/lib/integrations/wordpress/errors";
import { mapProviderFailure } from "@/lib/automation-platform/execution/adapters/map-provider-status";
import { invokeWordPressAdapter } from "@/lib/automation-platform/execution/adapters/wordpress";

const USER = "user_wp_isolation";
const CTX = buildFeatureAccessContext("owner@example.com");

function seedGoogleConnected() {
  saveExternalServiceCredentials({
    userId: USER,
    serviceId: "google",
    accessToken: "google-access",
    refreshToken: "google-refresh",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scope:
      "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file openid email profile",
    updatedAt: new Date().toISOString(),
  });
  saveExternalServiceConnection(USER, {
    ...createDefaultConnection(googleServiceDefinition),
    status: "connected",
    connectedAt: new Date().toISOString(),
    scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

function seedXConnected() {
  saveExternalServiceCredentials({
    userId: USER,
    serviceId: "x",
    accessToken: "x-access",
    refreshToken: "x-refresh",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scope: "tweet.read tweet.write users.read offline.access",
    updatedAt: new Date().toISOString(),
  });
  saveExternalServiceConnection(USER, {
    ...createDefaultConnection(xServiceDefinition),
    status: "connected",
    connectedAt: new Date().toISOString(),
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
  });
}

function wpLoaderCalls() {
  return (
    vi.mocked(wordpressPersistence.loadWordPressAuthFromSupabase).mock.calls
      .length +
    vi.mocked(wordpressPersistence.readWordPressAuthFromDurable).mock.calls
      .length
  );
}

function loggedWordPressConfigurationError(errorSpy: {
  mock: { calls: unknown[][] };
}) {
  return errorSpy.mock.calls.some((call) => {
    const label = String(call[0] ?? "");
    return (
      label === WORDPRESS_CONFIGURATION_ERROR_LABEL ||
      label.includes("ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY")
    );
  });
}

function wordpressAutomationStep() {
  return {
    id: "s_wp",
    type: "wordpress" as const,
    name: "WP",
    order: 0,
    enabled: true,
    inputBindings: {},
    configuration: {
      title: "設定欠落時の投稿",
      content: "<p>本文</p>",
    },
    requiresApproval: false,
    retryPolicy: { maxAttempts: 1, backoffMs: [0] },
    timeoutMs: 60_000,
    onSuccess: null,
    onFailure: null,
  };
}

describe("WordPress credential isolation (permanent)", () => {
  let errorSpy: { mock: { calls: unknown[][] }; mockClear: () => void };

  beforeEach(() => {
    resetExternalAuthHydration();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetWordPressCredentialStore();
    resetWordPressConfigurationLogForTests();
    resetFeatureFlagStore();
    setFeatureFlagState("google", "on");
    setFeatureFlagState("x", "on");
    setFeatureFlagState("wordpress", "on");
    setFeatureFlagState("dropbox", "on");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY", "");
    vi.spyOn(wordpressPersistence, "loadWordPressAuthFromSupabase");
    vi.spyOn(wordpressPersistence, "readWordPressAuthFromDurable");
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetWordPressConfigurationLogForTests();
  });

  it("does not load WordPress credentials for Google Drive / Calendar", async () => {
    seedGoogleConnected();
    await ensureExternalAuthHydrated(USER);

    const drive = await requireGoogleIntegrationAccess({
      userId: USER,
      context: CTX,
      capability: "drive",
    });
    expect("accessToken" in drive || drive.status !== "feature_disabled").toBe(
      true,
    );
    if ("status" in drive) {
      expect(drive.status).not.toBe("feature_disabled");
    }

    const calendar = await requireGoogleIntegrationAccess({
      userId: USER,
      context: CTX,
      capability: "calendar",
    });
    expect(
      "accessToken" in calendar || calendar.status !== "feature_disabled",
    ).toBe(true);

    expect(wpLoaderCalls()).toBe(0);
    expect(loggedWordPressConfigurationError(errorSpy)).toBe(false);
  });

  it("does not load WordPress credentials for X connection / autopost hydrate", async () => {
    seedXConnected();
    await ensureExternalAuthHydrated(USER);
    const token = await getXAccountAccessTokenResult(USER);
    expect(
      token.status === "ready" ||
        token.status === "missing" ||
        token.status === "unavailable" ||
        token.status === "refresh_failed",
    ).toBe(true);
    const connection = getExternalServiceConnection(USER, "x");
    expect(connection.status).toBe("connected");
    expect(wpLoaderCalls()).toBe(0);
    expect(loggedWordPressConfigurationError(errorSpy)).toBe(false);
  });

  it("does not load WordPress credentials for LINE digest Google reads", async () => {
    seedGoogleConnected();
    const calendar = await requireGoogleIntegrationAccess({
      userId: USER,
      context: CTX,
      capability: "calendar",
    });
    expect("status" in calendar ? calendar.status : "ready").not.toBe(
      "configuration_error",
    );
    expect(wpLoaderCalls()).toBe(0);
    expect(loggedWordPressConfigurationError(errorSpy)).toBe(false);
  });

  it("does not load WordPress credentials for billing", async () => {
    await getBillingFeatureDenial(USER, "google_integration");
    expect(wpLoaderCalls()).toBe(0);
    expect(loggedWordPressConfigurationError(errorSpy)).toBe(false);
  });

  it("lists external-services with WordPress configuration_error only", async () => {
    seedGoogleConnected();
    seedXConnected();
    await ensureExternalAuthHydrated(USER);
    const catalog = externalServiceManager.getCatalog(USER, CTX);
    const google = catalog.services.find((row) => row.serviceId === "google");
    const x = catalog.services.find((row) => row.serviceId === "x");
    const wordpress = catalog.services.find(
      (row) => row.serviceId === "wordpress",
    );
    expect(google?.connection.status).toBe("connected");
    expect(x?.connection.status).toBe("connected");
    expect(wordpress?.connection.status).toBe("configuration_error");
    expect(wordpress?.connection.errorMessage).toBe(
      WP_MISSING_ENCRYPTION_KEY_MESSAGE,
    );
    expect(JSON.stringify(catalog)).not.toMatch(
      /applicationPassword|ATLAS_WORDPRESS/i,
    );
    expect(wpLoaderCalls()).toBe(0);
    expect(loggedWordPressConfigurationError(errorSpy)).toBe(false);
  });

  it("does not fail non-WordPress automation mapping as retryable WP config", () => {
    const mapped = mapProviderFailure({
      service: "WordPress",
      status: "configuration_error",
      message: WP_MISSING_ENCRYPTION_KEY_MESSAGE,
    });
    expect(mapped.ok).toBe(false);
    expect(mapped.retryable).toBe(false);
    expect(mapped.errorMessage).toBe("configuration_error");
  });

  it("non-WordPress X token path stays isolated after a WordPress job fails", async () => {
    seedXConnected();
    const wpJob = await invokeWordPressAdapter({
      step: wordpressAutomationStep(),
      userId: USER,
      automationName: "ブログ",
      automationId: "auto_wp",
      runId: "run_wp",
      approved: true,
    });
    expect(wpJob.ok).toBe(false);
    expect(wpJob.retryable).toBe(false);
    expect(wpJob.errorMessage).toBe("configuration_error");

    const beforeX = wpLoaderCalls();
    errorSpy.mockClear();
    const token = await getXAccountAccessTokenResult(USER);
    expect(
      token.status === "ready" ||
        token.status === "missing" ||
        token.status === "unavailable" ||
        token.status === "refresh_failed",
    ).toBe(true);
    expect(wpLoaderCalls()).toBe(beforeX);
    expect(loggedWordPressConfigurationError(errorSpy)).toBe(false);
  });

  it("WordPress posting fail-closes as configuration_error and loads once", async () => {
    const posted = await createWordPressPostForUser({
      userId: USER,
      context: CTX,
      payload: {
        title: "設定欠落時の投稿",
        content: "<p>本文</p>",
        status: "draft",
      },
    });
    expect(posted.status).toBe("configuration_error");
    expect(posted.developerCode).toBe("missing_encryption_key");
    expect(posted.message).toBe(WP_MISSING_ENCRYPTION_KEY_MESSAGE);
    expect(
      vi.mocked(wordpressPersistence.readWordPressAuthFromDurable),
    ).toHaveBeenCalledTimes(1);
    expect(loggedWordPressConfigurationError(errorSpy)).toBe(true);

    await createWordPressPostForUser({
      userId: USER,
      context: CTX,
      payload: {
        title: "二回目",
        content: "<p>本文</p>",
        status: "draft",
      },
    });
    const configLogs = errorSpy.mock.calls.filter(
      (call) => String(call[0]) === WORDPRESS_CONFIGURATION_ERROR_LABEL,
    );
    expect(configLogs.length).toBe(1);
    expect(JSON.stringify(configLogs[0]?.[1] ?? {})).not.toMatch(
      /applicationPassword|ATLAS_WORDPRESS|[A-Za-z0-9+/]{32,}/,
    );
  });

  it("WordPress connect fail-closes without calling the WordPress REST API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      connectWordPressAccount(USER, {
        siteUrl: "https://example.com",
        username: "editor",
        applicationPassword: "abcd efgh ijkl mnop",
      }),
    ).rejects.toThrow(WP_MISSING_ENCRYPTION_KEY_MESSAGE);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
