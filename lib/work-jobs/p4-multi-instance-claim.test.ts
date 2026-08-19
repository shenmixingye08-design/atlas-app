import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const persistDomain = vi.fn(async () => "supabase");
const loadDomain = vi.fn(async () => ({ jobs: [] as unknown[] }));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => persistDomain()),
  loadDurableDomain: vi.fn(async () => loadDomain()),
  pruneOversizedClerkDurableDomains: vi.fn(async () => ({
    migrated: [],
    cleared: [],
  })),
}));

const serviceRoleClient = vi.fn(() => null as unknown);

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => serviceRoleClient(),
}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => `${userId}@example.com`),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: () => false,
}));

import { applySubscriptionFromStripe } from "@/lib/billing/subscriptions/service";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { consumeAiJobQuota, aiJobClaimKey } from "@/lib/billing/usage/ai-job";
import {
  resetAiQuotaEngineForTests,
} from "@/lib/billing/usage/quota-engine";
import { resetUsageStore } from "@/lib/billing/usage/store";

import { acceptWorkJob } from "./accept";
import {
  listClaimedWorkJobIdsForTests,
  resetWorkJobClaimStoreForTests,
  WorkJobClaimUnavailableError,
  claimWorkJob,
} from "./claim";
import { ATLAS_WORK_JOB_IDEMPOTENCY_MIGRATION_SQL } from "./migration-sql";
import {
  clearWorkJobProcessMemoryForTests,
  findWorkJobByIdempotencyKeyDurable,
} from "./store";
import type { WorkJobRecord } from "./store";

type ClaimRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  assignment: string;
  metadata: Record<string, unknown>;
  status: string;
  attempt_count: number;
  max_attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function uniqueKey(userId: string, idempotencyKey: string): string {
  return `${userId}::${idempotencyKey}`;
}

function makeAtomicClaimClient(store: Map<string, ClaimRow>) {
  const toPayload = (action: "created" | "reused", row: ClaimRow) => ({
    action,
    ...row,
  });

  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "atlas_claim_work_job") {
        return { data: null, error: { message: "function does not exist" } };
      }
      const key = uniqueKey(String(args.p_user_id), String(args.p_idempotency_key));
      const existing = store.get(key);
      if (existing) {
        return { data: toPayload("reused", existing), error: null };
      }
      const now = new Date().toISOString();
      const row: ClaimRow = {
        id: String(args.p_id),
        user_id: String(args.p_user_id),
        idempotency_key: String(args.p_idempotency_key),
        assignment: String(args.p_assignment ?? ""),
        metadata:
          args.p_metadata && typeof args.p_metadata === "object"
            ? (args.p_metadata as Record<string, unknown>)
            : {},
        status: "queued",
        attempt_count: 0,
        max_attempts: Number(args.p_max_attempts ?? 3),
        error: null,
        created_at: now,
        updated_at: now,
        completed_at: null,
      };
      store.set(key, row);
      return { data: toPayload("created", row), error: null };
    },
    from: (table: string) => {
      if (table !== "atlas_work_jobs") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const key = uniqueKey(
                String(row.user_id),
                String(row.idempotency_key),
              );
              if (store.has(key)) {
                return {
                  data: null,
                  error: { code: "23505", message: "duplicate key" },
                };
              }
              const created = {
                id: String(row.id),
                user_id: String(row.user_id),
                idempotency_key: String(row.idempotency_key),
                assignment: String(row.assignment ?? ""),
                metadata:
                  row.metadata && typeof row.metadata === "object"
                    ? (row.metadata as Record<string, unknown>)
                    : {},
                status: String(row.status ?? "queued"),
                attempt_count: Number(row.attempt_count ?? 0),
                max_attempts: Number(row.max_attempts ?? 3),
                error: typeof row.error === "string" ? row.error : null,
                created_at: String(row.created_at ?? new Date().toISOString()),
                updated_at: String(row.updated_at ?? new Date().toISOString()),
                completed_at:
                  typeof row.completed_at === "string" ? row.completed_at : null,
              } satisfies ClaimRow;
              store.set(key, created);
              return { data: created, error: null };
            },
          }),
        }),
        select: () => ({
          eq: (col: string, val: string) => ({
            eq: (col2: string, val2: string) => ({
              maybeSingle: async () => {
                const userId = col === "user_id" ? val : val2;
                const idempotencyKey =
                  col2 === "idempotency_key" ? val2 : val;
                return {
                  data: store.get(uniqueKey(userId, idempotencyKey)) ?? null,
                  error: null,
                };
              },
            }),
          }),
        }),
      };
    },
  };
}

function makeUnavailableClient() {
  return {
    rpc: async () => ({
      data: null,
      error: { message: "connection timeout" },
    }),
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: null,
            error: { message: "connection timeout" },
          }),
        }),
      }),
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { message: "read timeout" },
            }),
          }),
        }),
      }),
    }),
  };
}

function makeConflictUnreadClient(store: Map<string, ClaimRow>) {
  return {
    rpc: async () => ({
      data: null,
      error: { message: "Could not find the function atlas_claim_work_job" },
    }),
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const key = uniqueKey(
              String(row.user_id),
              String(row.idempotency_key),
            );
            if (store.has(key)) {
              return {
                data: null,
                error: { code: "23505", message: "duplicate key" },
              };
            }
            store.set(key, {
              id: String(row.id),
              user_id: String(row.user_id),
              idempotency_key: String(row.idempotency_key),
              assignment: String(row.assignment ?? ""),
              metadata: {},
              status: "queued",
              attempt_count: 0,
              max_attempts: 3,
              error: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              completed_at: null,
            });
            return { data: store.get(key) ?? null, error: null };
          },
        }),
      }),
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { message: "read timeout after unique conflict" },
            }),
          }),
        }),
      }),
    }),
  };
}

async function seedLightPlan(userId: string) {
  await applySubscriptionFromStripe({
    userId,
    stripeCustomerId: `cus_${userId}`,
    stripeSubscriptionId: `sub_${userId}`,
    planId: "light",
    status: "active",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}

function draftJob(
  userId: string,
  idempotencyKey: string,
  assignment = "同じ依頼",
): WorkJobRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId,
    assignment,
    idempotencyKey,
    metadata: {},
    status: "queued",
    attemptCount: 0,
    maxAttempts: 3,
    error: null,
    visionGate: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

describe("P4 Production multi-instance work-job claim", () => {
  beforeEach(async () => {
    resetWorkJobClaimStoreForTests();
    clearWorkJobProcessMemoryForTests();
    resetAiQuotaEngineForTests();
    resetUsageStore();
    resetSubscriptionStore();
    persistDomain.mockClear();
    loadDomain.mockClear();
    persistDomain.mockResolvedValue("supabase");
    loadDomain.mockResolvedValue({ jobs: [] });
    serviceRoleClient.mockReturnValue(null);
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("SQL SoT is unique (user_id, idempotency_key) + INSERT ON CONFLICT", () => {
    const migration = readFileSync(
      new URL(
        "../../supabase/migrations/20260819_p4_work_job_idempotency.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const sql of [migration, ATLAS_WORK_JOB_IDEMPOTENCY_MIGRATION_SQL]) {
      expect(sql).toMatch(/unique \(user_id, idempotency_key\)/);
      expect(sql).toMatch(/on conflict \(user_id, idempotency_key\) do nothing/i);
      expect(sql).toMatch(/atlas_claim_work_job/);
      expect(sql).not.toMatch(/select \*[\s\S]*insert into public\.atlas_work_jobs/i);
    }
  });

  it("POST /api/work/jobs does not SELECT-then-INSERT", () => {
    const src = readFileSync(
      new URL("../../app/api/work/jobs/route.ts", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/acceptWorkJob/);
    expect(src).not.toMatch(/findWorkJobByIdempotencyKeyDurable/);
    expect(src).not.toMatch(/crypto\.randomUUID/);
  });

  it("1. concurrent two creates → one job, one Usage, one AI", async () => {
    const userId = "user_p4_race_2";
    await seedLightPlan(userId);
    const executions: string[] = [];
    const results = await Promise.all(
      [0, 1].map(() =>
        acceptWorkJob({
          userId,
          assignment: "週報をまとめて",
          clientKey: "same-key-2",
          startExecution: (jobId) => {
            executions.push(jobId);
          },
        }),
      ),
    );
    expect(results.every((row) => row.ok)).toBe(true);
    const ids = results.map((row) => (row.ok ? row.jobId : ""));
    expect(new Set(ids).size).toBe(1);
    expect(results.filter((row) => row.ok && !row.reused)).toHaveLength(1);
    expect(results.filter((row) => row.ok && row.reused)).toHaveLength(1);
    expect(executions).toEqual([ids[0]]);
    expect(listClaimedWorkJobIdsForTests(userId, results[0]!.ok ? results[0].idempotencyKey : "")).toHaveLength(1);

    const usage = await consumeAiJobQuota({
      userId,
      claimKey: aiJobClaimKey(
        "work_job",
        userId,
        results[0]!.ok ? results[0].idempotencyKey : "",
      ),
    });
    expect(usage.ok).toBe(true);
    if (usage.ok) {
      expect(usage.idempotent).toBe(true);
      expect(usage.used).toBe(1);
    }
  });

  it("2. 10 parallel creates → one job, one Usage, one AI", async () => {
    const userId = "user_p4_race_10";
    await seedLightPlan(userId);
    const executions: string[] = [];
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        acceptWorkJob({
          userId,
          assignment: "請求書を整理",
          clientKey: "same-key-10",
          startExecution: (jobId) => {
            executions.push(jobId);
          },
        }),
      ),
    );
    expect(results.every((row) => row.ok)).toBe(true);
    const ids = new Set(results.map((row) => (row.ok ? row.jobId : "")));
    expect(ids.size).toBe(1);
    expect(executions).toHaveLength(1);
    const usage = await consumeAiJobQuota({
      userId,
      claimKey: aiJobClaimKey(
        "work_job",
        userId,
        results[0]!.ok ? results[0].idempotencyKey : "",
      ),
    });
    expect(usage.ok && usage.used).toBe(1);
  });

  it("2b. 10 parallel creates against unique table → one job", async () => {
    const userId = "user_p4_race_10_table";
    await seedLightPlan(userId);
    const store = new Map<string, ClaimRow>();
    serviceRoleClient.mockReturnValue(makeAtomicClaimClient(store));
    const executions: string[] = [];
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        acceptWorkJob({
          userId,
          assignment: "請求書を整理",
          clientKey: "same-key-10-table",
          startExecution: (jobId) => {
            executions.push(jobId);
          },
        }),
      ),
    );
    expect(results.every((row) => row.ok)).toBe(true);
    expect(new Set(results.map((row) => (row.ok ? row.jobId : ""))).size).toBe(1);
    expect(store.size).toBe(1);
    expect(executions).toHaveLength(1);
  });

  it("3. empty process memory (other instance) still reuses the same job", async () => {
    const userId = "user_p4_other_instance";
    await seedLightPlan(userId);
    const executions: string[] = [];
    const first = await acceptWorkJob({
      userId,
      assignment: "提案書を作成",
      clientKey: "other-instance",
      startExecution: (jobId) => {
        executions.push(jobId);
      },
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.reused).toBe(false);
    clearWorkJobProcessMemoryForTests();
    const second = await acceptWorkJob({
      userId,
      assignment: "提案書を作成",
      clientKey: "other-instance",
      startExecution: (jobId) => {
        executions.push(jobId);
      },
    });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.jobId).toBe(first.jobId);
      expect(second.reused).toBe(true);
    }
    expect(executions).toHaveLength(1);
  });

  it("3b. Production unique table: empty process memory still one job", async () => {
    const userId = "user_p4_prod_table";
    await seedLightPlan(userId);
    const store = new Map<string, ClaimRow>();
    serviceRoleClient.mockReturnValue(makeAtomicClaimClient(store));
    const executions: string[] = [];
    const first = await acceptWorkJob({
      userId,
      assignment: "議事録",
      clientKey: "prod-table",
      startExecution: (jobId) => executions.push(jobId),
    });
    clearWorkJobProcessMemoryForTests();
    const second = await acceptWorkJob({
      userId,
      assignment: "議事録",
      clientKey: "prod-table",
      startExecution: (jobId) => executions.push(jobId),
    });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.jobId).toBe(first.jobId);
      expect(second.reused).toBe(true);
    }
    expect(store.size).toBe(1);
    expect(executions).toHaveLength(1);
  });

  it("4. durable lookup failure does not create a job", async () => {
    const userId = "user_p4_lookup_fail";
    await seedLightPlan(userId);
    loadDomain.mockRejectedValue(new Error("DB unavailable"));
    await expect(
      findWorkJobByIdempotencyKeyDurable("user_lookup", "work:user_lookup:client:x"),
    ).rejects.toBeInstanceOf(WorkJobClaimUnavailableError);

    serviceRoleClient.mockReturnValue(makeUnavailableClient());
    const executions: string[] = [];
    const denied = await acceptWorkJob({
      userId,
      assignment: "失敗しても作らない",
      clientKey: "lookup-fail",
      startExecution: (jobId) => executions.push(jobId),
    });
    expect(denied).toMatchObject({ ok: false, httpStatus: 503 });
    expect(executions).toHaveLength(0);
    expect(
      listClaimedWorkJobIdsForTests(
        userId,
        "work:user_p4_lookup_fail:client:lookup-fail",
      ),
    ).toHaveLength(0);
  });

  it("4b. unique conflict + unread existing row is fail-closed", async () => {
    const store = new Map<string, ClaimRow>();
    const userId = "user_p4_unread";
    const key = "work:user_p4_unread:client:unread";
    store.set(uniqueKey(userId, key), {
      id: "already_there",
      user_id: userId,
      idempotency_key: key,
      assignment: "既存",
      metadata: {},
      status: "queued",
      attempt_count: 0,
      max_attempts: 3,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    });
    serviceRoleClient.mockReturnValue(makeConflictUnreadClient(store));
    await expect(
      claimWorkJob(draftJob(userId, key)),
    ).rejects.toBeInstanceOf(WorkJobClaimUnavailableError);
    expect(store.size).toBe(1);
    expect(store.get(uniqueKey(userId, key))?.id).toBe("already_there");
  });

  it("4c. Production without service role refuses Map fallback", async () => {
    const userId = "user_p4_prod_nomap";
    await seedLightPlan(userId);
    vi.stubEnv("VERCEL_ENV", "production");
    serviceRoleClient.mockReturnValue(null);
    await expect(
      claimWorkJob(
        draftJob(userId, "work:user_p4_prod_nomap:client:no-map"),
      ),
    ).rejects.toBeInstanceOf(WorkJobClaimUnavailableError);
    const executions: string[] = [];
    const denied = await acceptWorkJob({
      userId,
      assignment: "本番はMap禁止",
      clientKey: "no-map",
      startExecution: (jobId) => executions.push(jobId),
    });
    expect(denied).toMatchObject({ ok: false, httpStatus: 503 });
    expect(executions).toHaveLength(0);
    expect(
      listClaimedWorkJobIdsForTests(userId, "work:user_p4_prod_nomap:client:no-map"),
    ).toHaveLength(0);
  });

  it("5+6+7. different idempotency keys create separate jobs; same key stays one Usage/AI", async () => {
    const userId = "user_p4_keys";
    await seedLightPlan(userId);
    const executions: string[] = [];
    const a = await acceptWorkJob({
      userId,
      assignment: "A",
      clientKey: "key-a",
      startExecution: (jobId) => executions.push(jobId),
    });
    const b = await acceptWorkJob({
      userId,
      assignment: "B",
      clientKey: "key-b",
      startExecution: (jobId) => executions.push(jobId),
    });
    const aAgain = await acceptWorkJob({
      userId,
      assignment: "A",
      clientKey: "key-a",
      startExecution: (jobId) => executions.push(jobId),
    });
    expect(a.ok && b.ok && aAgain.ok).toBe(true);
    if (a.ok && b.ok && aAgain.ok) {
      expect(a.jobId).not.toBe(b.jobId);
      expect(aAgain.jobId).toBe(a.jobId);
      expect(aAgain.reused).toBe(true);
    }
    expect(executions).toHaveLength(2);
    const usageA = await consumeAiJobQuota({
      userId,
      claimKey: aiJobClaimKey(
        "work_job",
        userId,
        a.ok ? a.idempotencyKey : "",
      ),
    });
    const usageB = await consumeAiJobQuota({
      userId,
      claimKey: aiJobClaimKey(
        "work_job",
        userId,
        b.ok ? b.idempotencyKey : "",
      ),
    });
    expect(usageA.ok && usageA.used).toBe(2);
    expect(usageB.ok && usageB.used).toBe(2);
  });
});
