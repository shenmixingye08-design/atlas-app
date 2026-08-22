import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const loaders = vi.hoisted(() => ({
  google: vi.fn(),
  x: vi.fn(),
  dropbox: vi.fn(),
  wordpress: vi.fn(),
  durableDomain: vi.fn(),
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

import {
  ensureExternalAuthHydrated,
  resetExternalAuthHydration,
} from "./durable";
import { resetExternalServiceStore } from "./store";
import { resetExternalServiceCredentialStore } from "./credential-store";
import { buildXAuthorizeUrl } from "@/lib/integrations/x/oauth";
import { EXPECTED_X_PRODUCTION_REDIRECT_URI } from "@/lib/integrations/x/config";

describe("external auth hydration isolation", () => {
  beforeEach(() => {
    resetExternalAuthHydration();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    loaders.google.mockReset();
    loaders.x.mockReset();
    loaders.dropbox.mockReset();
    loaders.wordpress.mockReset();
    loaders.durableDomain.mockReset();
    loaders.google.mockResolvedValue(null);
    loaders.x.mockResolvedValue(null);
    loaders.dropbox.mockResolvedValue(null);
    loaders.wordpress.mockResolvedValue(null);
    loaders.durableDomain.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("continues X/Google/Dropbox loads when WordPress throws", async () => {
    loaders.wordpress.mockRejectedValue(
      new Error("ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY missing"),
    );

    await ensureExternalAuthHydrated("user_x_wp_throw");

    expect(loaders.google).toHaveBeenCalledWith("user_x_wp_throw");
    expect(loaders.x).toHaveBeenCalledWith("user_x_wp_throw");
    expect(loaders.dropbox).toHaveBeenCalledWith("user_x_wp_throw");
    expect(loaders.wordpress).toHaveBeenCalledWith("user_x_wp_throw");
    expect(loaders.durableDomain).toHaveBeenCalled();
  });

  it("does not treat WordPress missing-key null as an X connect blocker", async () => {
    loaders.wordpress.mockResolvedValue(null);

    await ensureExternalAuthHydrated("user_x_wp_null");

    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("X_CLIENT_ID", "atlas-x-client");
    vi.stubEnv("OAUTH_STATE_SECRET", "oauth-state-secret-for-test");
    vi.stubEnv("X_REDIRECT_URI", "");
    vi.stubEnv("X_OAUTH_REDIRECT_URI", "");

    const url = buildXAuthorizeUrl(
      "https://atlasapp.jp",
      "user_x_wp_null",
      { returnTo: "/workspace/x" },
    );
    expect(url).toContain("twitter.com/i/oauth2/authorize");
    expect(url).toContain(
      encodeURIComponent(EXPECTED_X_PRODUCTION_REDIRECT_URI),
    );
  });
});
