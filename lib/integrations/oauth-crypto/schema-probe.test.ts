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

import { probeOAuthTokenEncryptionSchema } from "./schema-probe";

const KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function tableResponse(rows: unknown[], error: { message: string } | null = null) {
  return {
    select: () => ({
      limit: () => Promise.resolve({ data: rows, error }),
    }),
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
    fromMock.mockImplementation(() =>
      tableResponse([
        {
          access_token:
            "enc:v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB==:CCCCCCCCCCCC",
          refresh_token:
            "enc:v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB==:DDDDDDDDDDDD",
          encryption_key_version: 1,
        },
      ]),
    );

    const result = await probeOAuthTokenEncryptionSchema();
    expect(result.encryptionKeyConfigured).toBe(true);
    expect(result.encryptionKeyVersion).toBe(1);
    expect(result.googleTableOk).toBe(true);
    expect(result.dropboxTableOk).toBe(true);
    expect(result.tokenShape.plaintextLegacyRows).toBe(0);
    expect(result.ok).toBe(true);
    // Never echo token material in probe object stringification of errors.
    expect(JSON.stringify(result)).not.toMatch(/ya29\.|sl\./);
  });

  it("detects legacy plaintext rows without exposing values", async () => {
    fromMock.mockImplementation(() =>
      tableResponse([
        {
          access_token: "ya29.should-not-appear-in-logs",
          refresh_token: "1//should-not-appear",
          encryption_key_version: null,
        },
      ]),
    );

    const result = await probeOAuthTokenEncryptionSchema();
    expect(result.tokenShape.plaintextLegacyRows).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("ya29.should-not-appear-in-logs");
    expect(JSON.stringify(result)).not.toContain("1//should-not-appear");
  });

  it("fails closed when encryption key missing", async () => {
    delete process.env.ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY;
    fromMock.mockImplementation(() => tableResponse([]));
    const result = await probeOAuthTokenEncryptionSchema();
    expect(result.encryptionKeyConfigured).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("encryption_key_missing");
  });
});
