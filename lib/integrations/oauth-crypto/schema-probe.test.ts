import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: vi.fn(() => ({ from: fromMock })),
}));

vi.mock("@/lib/supabase/apply-migration-sql", () => ({
  applyMigrationSql: vi.fn(async () => ({
    appliedViaPostgres: false,
    appliedViaManagementApi: false,
    error: null,
    envPresence: {
      serviceRole: true,
      postgresUrl: false,
      supabaseAccessToken: false,
      projectRef: null,
      postgresEnvKeys: [],
    },
  })),
  getMigrationEnvPresence: vi.fn(() => ({
    serviceRole: true,
    postgresUrl: false,
    supabaseAccessToken: false,
    projectRef: null,
    postgresEnvKeys: [],
  })),
}));

vi.mock("@/lib/health/version-info", () => ({
  getHealthVersionPayload: vi.fn(() => ({
    ok: true,
    environment: "test",
    commitSha: "test",
    commitShaShort: "test",
    buildTime: null,
    appVersion: "0.1.0",
    vercelUrl: null,
  })),
}));

import { encryptOAuthSecret } from "./crypto";
import { probeOAuthTokenEncryptionSchema } from "./schema-probe";

const KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function makeClientMock(options: {
  sampleRows: unknown[];
  sampleError?: { message: string } | null;
  canaryStoredCiphertext?: boolean;
}) {
  let canaryRow: {
    access_token: string;
    refresh_token: string;
    encryption_key_version: number;
  } | null = null;

  return () => {
    const api: Record<string, unknown> = {};
    api.select = (cols: string) => {
      if (cols === "user_id") {
        return {
          limit: () =>
            Promise.resolve({
              data: [{ user_id: "u1" }],
              error: null,
            }),
        };
      }
      if (cols.includes("access_token") && cols.includes("user_id")) {
        return {
          limit: () =>
            Promise.resolve({
              data: options.sampleRows,
              error: options.sampleError ?? null,
            }),
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data:
                  canaryRow && options.canaryStoredCiphertext !== false
                    ? canaryRow
                    : canaryRow,
                error: null,
              }),
          }),
        };
      }
      return {
        limit: () =>
          Promise.resolve({
            data: options.sampleRows,
            error: options.sampleError ?? null,
          }),
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: canaryRow,
              error: null,
            }),
        }),
      };
    };
    api.upsert = (row: {
      access_token: string;
      refresh_token: string;
      encryption_key_version: number;
    }) => {
      canaryRow = {
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        encryption_key_version: row.encryption_key_version,
      };
      return Promise.resolve({ error: null });
    };
    api.update = () => ({
      eq: () => Promise.resolve({ error: null }),
    });
    api.delete = () => ({
      eq: () => {
        canaryRow = null;
        return Promise.resolve({ error: null });
      },
    });
    return api;
  };
}

describe("oauth encryption schema probe", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY", KEY);
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_VERSION", "1");
    fromMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports ok when tables/columns exist and key is configured", async () => {
    const access = encryptOAuthSecret("access-token-value").ciphertext;
    const refresh = encryptOAuthSecret("refresh-token-value").ciphertext;
    fromMock.mockImplementation(
      makeClientMock({
        sampleRows: [
          {
            user_id: "user_1",
            access_token: access,
            refresh_token: refresh,
            encryption_key_version: 1,
          },
        ],
      }),
    );

    const result = await probeOAuthTokenEncryptionSchema();
    expect(result.encryptionKeyConfigured).toBe(true);
    expect(result.encryptionKeyVersion).toBe(1);
    expect(result.googleTableOk).toBe(true);
    expect(result.dropboxTableOk).toBe(true);
    expect(result.encryptionSelfTestOk).toBe(true);
    expect(result.canaryPersistOk).toBe(true);
    expect(result.tokenShape.plaintextLegacyRows).toBe(0);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/ya29\.|sl\./);
    expect(JSON.stringify(result)).not.toContain("access-token-value");
  });

  it("detects legacy plaintext rows without exposing values", async () => {
    fromMock.mockImplementation(
      makeClientMock({
        sampleRows: [
          {
            user_id: "user_legacy",
            access_token: "ya29.should-not-appear-in-logs",
            refresh_token: "1//should-not-appear",
            encryption_key_version: null,
          },
        ],
      }),
    );

    const result = await probeOAuthTokenEncryptionSchema();
    // Probe re-encrypts legacy when key is present.
    expect(result.legacyReencrypted).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("ya29.should-not-appear-in-logs");
    expect(JSON.stringify(result)).not.toContain("1//should-not-appear");
  });

  it("fails closed when encryption key missing", async () => {
    delete process.env.ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY;
    fromMock.mockImplementation(
      makeClientMock({
        sampleRows: [],
      }),
    );
    const result = await probeOAuthTokenEncryptionSchema();
    expect(result.encryptionKeyConfigured).toBe(false);
    expect(result.encryptionSelfTestOk).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("encryption_key_missing");
  });
});
