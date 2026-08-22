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
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/apply-migration-sql", () => ({
  applyMigrationSql: (...args: unknown[]) => applyMigrationSql(...args),
  getMigrationEnvPresence: () => getMigrationEnvPresence(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    from: fromMock,
    rpc: rpcMock,
  }),
}));

vi.mock("@/lib/health/version-info", () => ({
  getHealthVersionPayload: () => ({
    commitShaShort: "abc1234",
    environment: "test",
  }),
}));

const TABLE_MISSING =
  "Could not find the table 'public.atlas_deliverable_files' in the schema cache";
const RPC_MISSING =
  "Could not find the function public.atlas_claim_x_post_jobs in the schema cache";

function thenableResult(result: { error: { message: string } | null }) {
  const chain: {
    select: () => typeof chain;
    insert: () => typeof chain;
    update: () => typeof chain;
    upsert: () => typeof chain;
    delete: () => typeof chain;
    eq: () => typeof chain;
    limit: () => typeof chain;
    maybeSingle: () => typeof chain;
    then: (
      resolve: (value: { error: { message: string } | null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise<unknown>;
  } = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    upsert: () => chain,
    delete: () => chain,
    eq: () => chain,
    limit: () => chain,
    maybeSingle: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

describe("production schema probe behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMigrationSql.mockResolvedValue({
      appliedViaPostgres: true,
      appliedViaManagementApi: false,
      error: null,
      envPresence: getMigrationEnvPresence(),
    });
  });

  it("does not apply ensure SQL when every object already works", async () => {
    fromMock.mockImplementation(() => thenableResult({ error: null }));
    rpcMock.mockResolvedValue({ error: null });

    const { probeProductionAutomationSchema } = await import(
      "./production-schema-probe"
    );
    const result = await probeProductionAutomationSchema();
    expect(result.ok).toBe(true);
    expect(result.compatibility.status).toBe("compatible");
    expect(result.compatibility.objects.atlas_deliverable_files).toBe(
      "compatible",
    );
    expect(applyMigrationSql).not.toHaveBeenCalled();
  });

  it("self-heals missing tables even without apply=1", async () => {
    let ready = false;
    fromMock.mockImplementation(() =>
      thenableResult({
        error: ready ? null : { message: TABLE_MISSING },
      }),
    );
    rpcMock.mockImplementation(async () =>
      ready ? { error: null } : { error: { message: RPC_MISSING } },
    );
    applyMigrationSql.mockImplementation(async () => {
      ready = true;
      return {
        appliedViaPostgres: true,
        appliedViaManagementApi: false,
        error: null,
        envPresence: getMigrationEnvPresence(),
      };
    });

    const { probeProductionAutomationSchema } = await import(
      "./production-schema-probe"
    );
    const result = await probeProductionAutomationSchema();
    expect(applyMigrationSql).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.appliedViaPostgres).toBe(true);
    expect(result.compatibility.status).toBe("compatible");
  });

  it("classifies remaining PGRST205 as missing_table after a failed apply", async () => {
    fromMock.mockImplementation((table: string) =>
      thenableResult({
        error:
          table === "atlas_x_post_jobs" ? null : { message: TABLE_MISSING },
      }),
    );
    rpcMock.mockResolvedValue({ error: { message: RPC_MISSING } });
    applyMigrationSql.mockResolvedValue({
      appliedViaPostgres: false,
      appliedViaManagementApi: false,
      error: "postgres_url_missing",
      envPresence: getMigrationEnvPresence(),
    });

    const { probeProductionAutomationSchema } = await import(
      "./production-schema-probe"
    );
    const result = await probeProductionAutomationSchema({ apply: true });
    expect(result.ok).toBe(false);
    expect(result.compatibility.status).toBe("incompatible");
    expect(result.compatibility.objects.atlas_deliverable_files).toBe(
      "missing_table",
    );
    expect(result.compatibility.objects.atlas_claim_x_post_jobs).toBe(
      "missing_rpc",
    );
  });

  it("tick ensure applies only when a required object is missing", async () => {
    let ready = false;
    fromMock.mockImplementation(() =>
      thenableResult({
        error: ready ? null : { message: TABLE_MISSING },
      }),
    );
    rpcMock.mockImplementation(async () =>
      ready ? { error: null } : { error: { message: RPC_MISSING } },
    );
    applyMigrationSql.mockImplementation(async () => {
      ready = true;
      return {
        appliedViaPostgres: true,
        appliedViaManagementApi: false,
        error: null,
        envPresence: getMigrationEnvPresence(),
      };
    });

    const { ensureProductionAutomationSchemaIfMissing } = await import(
      "./production-schema-probe"
    );
    const first = await ensureProductionAutomationSchemaIfMissing();
    expect(first.applied).toBe(true);
    expect(first.schemaErrors).toEqual([]);

    const second = await ensureProductionAutomationSchemaIfMissing();
    expect(second.applied).toBe(false);
    expect(second.schemaErrors).toEqual([]);
    expect(applyMigrationSql).toHaveBeenCalledTimes(1);
  });
});
