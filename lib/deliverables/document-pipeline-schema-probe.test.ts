import { beforeEach, describe, expect, it, vi } from "vitest";

const applyMigrationSql = vi.fn();
const getMigrationEnvPresence = vi.fn(() => ({
  serviceRole: true,
  postgresUrl: true,
  supabaseAccessToken: false,
  projectRef: "proj",
  postgresEnvKeys: ["DATABASE_URL"],
}));

const fromMock = vi.fn();

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

function mockTableOk(table: string, ok: boolean) {
  return {
    select: () => ({
      limit: async () =>
        ok
          ? { error: null }
          : {
              error: {
                message: `Could not find the table 'public.${table}' in the schema cache`,
              },
            },
    }),
  };
}

describe("probeDocumentPipelineSchema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMigrationSql.mockResolvedValue({
      appliedViaPostgres: true,
      appliedViaManagementApi: false,
      error: null,
      envPresence: getMigrationEnvPresence(),
    });
    fromMock.mockImplementation((table: string) => mockTableOk(table, true));
  });

  it("reports ok when both Word durable tables are readable", async () => {
    const { probeDocumentPipelineSchema } = await import(
      "./document-pipeline-schema-probe"
    );
    const result = await probeDocumentPipelineSchema();
    expect(result.ok).toBe(true);
    expect(result.tableOk).toBe(true);
    expect(result.documentGenerationJobsOk).toBe(true);
    expect(result.deliverableJobsOk).toBe(true);
    expect(applyMigrationSql).not.toHaveBeenCalled();
  });

  it("applies migration when apply=true then probes tables", async () => {
    const { probeDocumentPipelineSchema } = await import(
      "./document-pipeline-schema-probe"
    );
    const result = await probeDocumentPipelineSchema({ apply: true });
    expect(applyMigrationSql).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.appliedViaPostgres).toBe(true);
  });

  it("fails when atlas_deliverable_jobs is missing", async () => {
    fromMock.mockImplementation((table: string) =>
      mockTableOk(table, table !== "atlas_deliverable_jobs"),
    );
    const { probeDocumentPipelineSchema } = await import(
      "./document-pipeline-schema-probe"
    );
    const result = await probeDocumentPipelineSchema();
    expect(applyMigrationSql).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.deliverableJobsOk).toBe(false);
    expect(result.documentGenerationJobsOk).toBe(true);
    expect(result.ownerHint).toMatch(/apply=1|NOTIFY pgrst/i);
  });
});
