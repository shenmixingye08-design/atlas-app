import { beforeEach, describe, expect, it, vi } from "vitest";

const applyMigrationSql = vi.fn();
const getMigrationEnvPresence = vi.fn(() => ({
  serviceRole: true,
  postgresUrl: true,
  supabaseAccessToken: false,
  projectRef: "proj",
  postgresEnvKeys: ["DATABASE_URL"],
}));

const selectLimit = vi.fn();
const fromMock = vi.fn(() => ({
  select: () => ({
    limit: selectLimit,
  }),
}));

vi.mock("@/lib/supabase/apply-migration-sql", () => ({
  applyMigrationSql: (...args: unknown[]) => applyMigrationSql(...args),
  getMigrationEnvPresence: () => getMigrationEnvPresence(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    from: fromMock,
  }),
}));

vi.mock("@/lib/health/version-info", () => ({
  getHealthVersionPayload: () => ({
    commitShaShort: "abc1234",
    environment: "test",
  }),
}));

describe("probeDocumentPipelineSchema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMigrationSql.mockResolvedValue({
      appliedViaPostgres: true,
      appliedViaManagementApi: false,
      error: null,
      envPresence: getMigrationEnvPresence(),
    });
  });

  it("reports ok when table is readable", async () => {
    selectLimit.mockResolvedValue({ error: null });
    const { probeDocumentPipelineSchema } = await import(
      "./document-pipeline-schema-probe"
    );
    const result = await probeDocumentPipelineSchema();
    expect(result.ok).toBe(true);
    expect(result.tableOk).toBe(true);
    expect(applyMigrationSql).not.toHaveBeenCalled();
  });

  it("applies migration when apply=true then probes table", async () => {
    selectLimit.mockResolvedValue({ error: null });

    const { probeDocumentPipelineSchema } = await import(
      "./document-pipeline-schema-probe"
    );
    const result = await probeDocumentPipelineSchema({ apply: true });
    expect(applyMigrationSql).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.tableOk).toBe(true);
    expect(result.appliedViaPostgres).toBe(true);
  });

  it("does not apply DDL on public probe without apply=true", async () => {
    selectLimit.mockResolvedValue({
      error: {
        message:
          "Could not find the table 'public.atlas_document_generation_jobs' in the schema cache",
      },
    });

    const { probeDocumentPipelineSchema } = await import(
      "./document-pipeline-schema-probe"
    );
    const result = await probeDocumentPipelineSchema();
    expect(applyMigrationSql).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.tableOk).toBe(false);
    expect(result.ownerHint).toMatch(/apply=1|NOTIFY pgrst/i);
  });
});
