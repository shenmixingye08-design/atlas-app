import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const TABLE_MISSING = {
  message: "Could not find the table 'public.atlas_deliverable_files' in the schema cache",
  code: "PGRST205",
};

function createMemoryTable() {
  const rows = new Map<string, Row>();
  let missing = false;
  const sidecars = new Map<string, string>();

  function filter(eqs: Array<[string, unknown]>): Row[] {
    return [...rows.values()].filter((row) =>
      eqs.every(([key, value]) => row[key] === value),
    );
  }

  function from(table: string) {
    const eqs: Array<[string, unknown]> = [];
    let pendingUpdate: Row | null = null;
    let pendingDelete = false;

    const finishSelect = async () => {
      if (missing) return { data: null, error: TABLE_MISSING };
      const matched = filter(eqs);
      return { data: matched, error: null };
    };

    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        eqs.push([column, value]);
        return chain;
      },
      limit: async () => {
        const result = await finishSelect();
        return {
          data: result.data ? result.data.slice(0, 1) : null,
          error: result.error,
        };
      },
      maybeSingle: async () => {
        if (missing) return { data: null, error: TABLE_MISSING };
        const matched = filter(eqs);
        return { data: matched[0] ?? null, error: null };
      },
      insert: async (payload: Row) => {
        if (missing) return { error: TABLE_MISSING };
        const id = String(payload.id);
        if (rows.has(id)) {
          return { error: { message: "duplicate key", code: "23505" } };
        }
        rows.set(id, { ...payload });
        return { error: null };
      },
      update: (payload: Row) => {
        pendingUpdate = payload;
        return chain;
      },
      upsert: async (payload: Row) => {
        if (missing) return { error: TABLE_MISSING };
        const id = String(payload.id);
        const prev = rows.get(id) ?? {};
        rows.set(id, { ...prev, ...payload });
        return { error: null };
      },
      delete: () => {
        pendingDelete = true;
        return chain;
      },
      then: (
        resolve: (value: { error: unknown; data?: unknown }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        const run = async () => {
          if (missing) return { error: TABLE_MISSING };
          if (pendingDelete) {
            for (const row of filter(eqs)) {
              rows.delete(String(row.id));
            }
            return { error: null };
          }
          if (pendingUpdate) {
            for (const row of filter(eqs)) {
              rows.set(String(row.id), { ...row, ...pendingUpdate });
            }
            return { error: null };
          }
          return finishSelect();
        };
        return run().then(resolve, reject);
      },
    };

    if (table !== "atlas_deliverable_files") {
      return chain;
    }
    return chain;
  }

  return {
    rows,
    from,
    setMissing(next: boolean) {
      missing = next;
    },
    storage: {
      from: () => ({
        upload: async (path: string, body: Buffer) => {
          sidecars.set(path, body.toString("utf8"));
          return { error: null };
        },
        download: async (path: string) => {
          const text = sidecars.get(path);
          if (!text) return { data: null, error: { message: "not_found" } };
          return {
            data: { text: async () => text },
            error: null,
          };
        },
      }),
    },
  };
}

const table = createMemoryTable();

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    from: table.from,
    storage: table.storage,
  }),
}));

import {
  loadDurableDeliverable,
  persistDurableDeliverable,
  resetDurableDeliverableStoreForTests,
  type DurableDeliverableRow,
} from "./durable-store";
import { resetMemoryDurableStorageForTests } from "./memory-durable-storage";

function sampleRow(id: string): DurableDeliverableRow {
  const now = new Date().toISOString();
  return {
    id,
    userId: "user_schema_persist_probe",
    fileName: "schema-probe.txt",
    format: "txt",
    mimeType: "text/plain",
    isPlaceholder: true,
    sourceContent: "schema-probe",
    baseFileName: "schema-probe",
    sizeBytes: 12,
    contentBase64: Buffer.from("schema-probe").toString("base64"),
    contentSha256: "a".repeat(64),
    storageBucket: null,
    storagePath: null,
    storageStatus: "pending",
    storageError: null,
    hasPkHeader: false,
    ooxmlVerified: false,
    downloadCount: 0,
    lastDownloadedAt: null,
    deletionReason: null,
    deletedAt: null,
    metadata: { jobId: "job_schema_probe" },
    generatedAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe("atlas_deliverable_files Supabase persistence", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ATLAS_DELIVERABLE_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
    table.rows.clear();
    table.setMissing(false);
    resetDurableDeliverableStoreForTests();
    resetMemoryDurableStorageForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("INSERT / UPSERT / SELECT / READ BACK use the primary table path", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const bytes = Buffer.from("schema-probe");
    const first = await persistDurableDeliverable(sampleRow(id), bytes);
    expect(first.ok).toBe(true);
    expect(first.schemaMissing).toBe(false);
    expect(table.rows.has(id)).toBe(true);

    const second = await persistDurableDeliverable(
      {
        ...sampleRow(id),
        fileName: "schema-probe-upsert.txt",
      },
      bytes,
    );
    expect(second.ok).toBe(true);
    expect(second.schemaMissing).toBe(false);
    expect(table.rows.size).toBe(1);
    expect(table.rows.get(id)?.file_name).toBe("schema-probe-upsert.txt");

    resetDurableDeliverableStoreForTests();
    const loaded = await loadDurableDeliverable(id, "user_schema_persist_probe");
    expect(loaded?.id).toBe(id);
    expect(loaded?.fileName).toBe("schema-probe-upsert.txt");
    expect(loaded?.userId).toBe("user_schema_persist_probe");
  });

  it("duplicate persist is idempotent on primary key id", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const bytes = Buffer.from("schema-probe");
    await persistDurableDeliverable(sampleRow(id), bytes);
    await persistDurableDeliverable(sampleRow(id), bytes);
    expect(table.rows.size).toBe(1);
  });

  it("uses Storage sidecar only as emergency fallback when the table is missing", async () => {
    table.setMissing(true);
    const id = "33333333-3333-4333-8333-333333333333";
    const result = await persistDurableDeliverable(
      sampleRow(id),
      Buffer.from("schema-probe-bytes"),
    );
    expect(result.schemaMissing).toBe(true);
    expect(table.rows.size).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.row.storageStatus).toBe("stored");
  });
});
