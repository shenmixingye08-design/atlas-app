/**
 * P0-02: Google / X / Dropbox credential persistence must encrypt at rest.
 * Proves real persist/load paths use oauth-crypto (not just unused helpers).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExternalServiceCredentialRecord } from "@/lib/integrations/external-services/credential-store";
import type { ExternalServiceConnection } from "@/lib/integrations/external-services/types";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import { googleServiceDefinition } from "@/lib/integrations/google/definition";
import { xServiceDefinition } from "@/lib/integrations/x/definition";
import { dropboxServiceDefinition } from "@/lib/integrations/dropbox/definition";
import {
  decryptOAuthSecret,
  isEncryptedOAuthPayload,
  OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE,
  redactOAuthSecrets,
} from "@/lib/integrations/oauth-crypto";

const KEY_V1 =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

type StoredRow = Record<string, unknown>;

const tables = new Map<string, Map<string, StoredRow>>();

function table(name: string): Map<string, StoredRow> {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name)!;
}

function makeClient() {
  return {
    from(tableName: string) {
      return {
        upsert(row: StoredRow) {
          const userId = String(row.user_id);
          table(tableName).set(userId, { ...row });
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(_col: string, userId: string) {
              return {
                maybeSingle() {
                  const row = table(tableName).get(userId) ?? null;
                  return Promise.resolve({ data: row, error: null });
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(_col: string, userId: string) {
              table(tableName).delete(userId);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: vi.fn(() => makeClient()),
}));

import {
  loadGoogleAuthFromSupabase,
  persistGoogleAuthToSupabase,
} from "@/lib/integrations/google/credential-persistence";
import {
  loadXAuthFromSupabase,
  persistXAuthToSupabase,
} from "@/lib/integrations/x/credential-persistence";
import {
  loadDropboxAuthFromSupabase,
  persistDropboxAuthToSupabase,
} from "@/lib/integrations/dropbox/credential-persistence";

function creds(
  serviceId: "google" | "x" | "dropbox",
  access: string,
  refresh: string,
): ExternalServiceCredentialRecord {
  return {
    userId: `user_${serviceId}`,
    serviceId,
    accessToken: access,
    refreshToken: refresh,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    scope: "test.scope",
    updatedAt: new Date().toISOString(),
  };
}

function connection(
  def:
    | typeof googleServiceDefinition
    | typeof xServiceDefinition
    | typeof dropboxServiceDefinition,
): ExternalServiceConnection {
  return {
    ...createDefaultConnection(def),
    status: "connected",
    connectedAt: new Date().toISOString(),
    lastUsedAt: null,
    scopes: [...def.plannedScopes],
    features: [...def.plannedFeatures],
    errorMessage: null,
    account: {
      email: "user@example.com",
      name: "Test User",
      pictureUrl: null,
      username: def.serviceId === "x" ? "atlas_user" : undefined,
      providerUserId: def.serviceId === "dropbox" ? "dbid:123" : undefined,
    },
  };
}

describe("P0-02 credential persistence encryption paths", () => {
  beforeEach(() => {
    tables.clear();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY", KEY_V1);
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_VERSION", "1");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V1", KEY_V1);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    tables.clear();
  });

  it("F: Google persist stores ciphertext only; load decrypts", async () => {
    const access = "ya29.google-access-UNIQUE";
    const refresh = "1//google-refresh-UNIQUE";
    const c = creds("google", access, refresh);
    const ok = await persistGoogleAuthToSupabase(
      c,
      connection(googleServiceDefinition),
    );
    expect(ok).toBe(true);

    const row = table("atlas_google_oauth_credentials").get("user_google")!;
    expect(String(row.access_token)).not.toContain(access);
    expect(String(row.refresh_token)).not.toContain(refresh);
    expect(isEncryptedOAuthPayload(String(row.access_token))).toBe(true);
    expect(isEncryptedOAuthPayload(String(row.refresh_token))).toBe(true);
    expect(row.encryption_key_version).toBe(1);
    expect(JSON.stringify(row)).not.toContain(access);
    expect(JSON.stringify(row)).not.toContain(refresh);

    const loaded = await loadGoogleAuthFromSupabase("user_google");
    expect(loaded?.credentials.accessToken).toBe(access);
    expect(loaded?.credentials.refreshToken).toBe(refresh);
  });

  it("G: X persist/load encrypts", async () => {
    const access = "x-access-UNIQUE-token";
    const refresh = "x-refresh-UNIQUE-token";
    const ok = await persistXAuthToSupabase(
      creds("x", access, refresh),
      connection(xServiceDefinition),
    );
    expect(ok).toBe(true);
    const row = table("atlas_x_oauth_credentials").get("user_x")!;
    expect(String(row.access_token)).not.toContain(access);
    expect(decryptOAuthSecret(String(row.access_token))).toBe(access);
    const loaded = await loadXAuthFromSupabase("user_x");
    expect(loaded?.credentials.refreshToken).toBe(refresh);
  });

  it("H: Dropbox persist/load encrypts", async () => {
    const access = "sl.dropbox-access-UNIQUE";
    const refresh = "dropbox-refresh-UNIQUE";
    const ok = await persistDropboxAuthToSupabase(
      creds("dropbox", access, refresh),
      connection(dropboxServiceDefinition),
    );
    expect(ok).toBe(true);
    const row = table("atlas_dropbox_oauth_credentials").get("user_dropbox")!;
    expect(isEncryptedOAuthPayload(String(row.access_token))).toBe(true);
    expect(String(row.refresh_token)).not.toContain(refresh);
    const loaded = await loadDropboxAuthFromSupabase("user_dropbox");
    expect(loaded?.credentials.accessToken).toBe(access);
  });

  it("I: refresh update keeps encryption", async () => {
    const initial = creds("google", "access-old", "refresh-old");
    await persistGoogleAuthToSupabase(
      initial,
      connection(googleServiceDefinition),
    );
    const refreshed = {
      ...initial,
      accessToken: "access-new-after-refresh",
      refreshToken: "refresh-new-after-refresh",
      updatedAt: new Date().toISOString(),
    };
    await persistGoogleAuthToSupabase(
      refreshed,
      connection(googleServiceDefinition),
    );
    const row = table("atlas_google_oauth_credentials").get("user_google")!;
    expect(isEncryptedOAuthPayload(String(row.access_token))).toBe(true);
    expect(String(row.access_token)).not.toContain("access-new-after-refresh");
    const loaded = await loadGoogleAuthFromSupabase("user_google");
    expect(loaded?.credentials.accessToken).toBe("access-new-after-refresh");
    expect(loaded?.credentials.refreshToken).toBe("refresh-new-after-refresh");
  });

  it("C: production persist without key fails closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    delete process.env.ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V1;

    const ok = await persistGoogleAuthToSupabase(
      creds("google", "plain-access", "plain-refresh"),
      connection(googleServiceDefinition),
    );
    expect(ok).toBe(false);
    expect(table("atlas_google_oauth_credentials").size).toBe(0);
  });

  it("K: legacy plaintext row is readable and re-encrypted on load", async () => {
    table("atlas_google_oauth_credentials").set("user_legacy", {
      user_id: "user_legacy",
      access_token: "legacy-access-plain",
      refresh_token: "legacy-refresh-plain",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      scope: "email",
      connection_status: "connected",
      connected_at: new Date().toISOString(),
      last_used_at: null,
      account_email: "legacy@example.com",
      account_name: "Legacy",
      account_picture_url: null,
      error_message: null,
      encryption_key_version: null,
      updated_at: new Date().toISOString(),
    });

    const loaded = await loadGoogleAuthFromSupabase("user_legacy");
    expect(loaded?.credentials.accessToken).toBe("legacy-access-plain");
    expect(loaded?.needsReencrypt).toBe(true);

    // Allow lazy re-encrypt fire-and-forget to complete.
    await new Promise((r) => setTimeout(r, 10));
    const row = table("atlas_google_oauth_credentials").get("user_legacy")!;
    expect(isEncryptedOAuthPayload(String(row.access_token))).toBe(true);
    expect(String(row.access_token)).not.toContain("legacy-access-plain");
    expect(decryptOAuthSecret(String(row.refresh_token))).toBe(
      "legacy-refresh-plain",
    );
  });

  it("D: tampered ciphertext cannot be used", async () => {
    await persistGoogleAuthToSupabase(
      creds("google", "good-access", "good-refresh"),
      connection(googleServiceDefinition),
    );
    const row = table("atlas_google_oauth_credentials").get("user_google")!;
    const parts = String(row.access_token).split(":");
    parts[4] = `${parts[4]!.slice(0, -4)}XXXX`;
    row.access_token = parts.join(":");

    const loaded = await loadGoogleAuthFromSupabase("user_google");
    expect(loaded).toBeNull();
  });

  it("J: API-shaped error objects do not include tokens after redact", () => {
    const payload = {
      error: "oauth_failed",
      access_token: "ya29.should-hide",
      credentials: {
        refresh_token: "1//should-hide",
      },
    };
    const safe = JSON.stringify(redactOAuthSecrets(payload));
    expect(safe).not.toContain("ya29.should-hide");
    expect(safe).not.toContain("1//should-hide");
    expect(safe).toContain("[redacted]");
  });

  it("production load without key refuses ciphertext rows", async () => {
    await persistGoogleAuthToSupabase(
      creds("google", "enc-access", "enc-refresh"),
      connection(googleServiceDefinition),
    );

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    delete process.env.ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V1;

    const loaded = await loadGoogleAuthFromSupabase("user_google");
    expect(loaded).toBeNull();
  });

  it("missing key message is stable for operators", () => {
    expect(OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE).toContain(
      "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
    );
  });
});
