/**
 * Persistence reliability: same job path × 10 under Vercel-like constraints.
 * Proves Clerk pointer-once, no /var/task writes, no 8KB / 429.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerkMeta = new Map<string, Record<string, unknown>>();
let clerkUpdateCalls = 0;

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUser: async (userId: string) => {
        return {
          id: userId,
          privateMetadata: { ...(clerkMeta.get(userId) ?? {}) },
        };
      },
      updateUserMetadata: async (
        userId: string,
        body: { privateMetadata?: Record<string, unknown> },
      ) => {
        clerkUpdateCalls += 1;
        if (clerkUpdateCalls > 80) {
          throw new Error("429 Too Many Requests");
        }
        const next = {
          ...(clerkMeta.get(userId) ?? {}),
          ...(body.privateMetadata ?? {}),
        };
        // Drop nulls (Clerk clear)
        for (const [k, v] of Object.entries(next)) {
          if (v === null) delete next[k];
        }
        const bytes = new TextEncoder().encode(JSON.stringify(next)).length;
        if (bytes > 8192) {
          throw new Error(
            "The given private_metadata exceeds the maximum allowed size of 8192 bytes (8 KB).",
          );
        }
        clerkMeta.set(userId, next);
      },
    },
  }),
}));

const sbStore = new Map<string, unknown>();
const notificationRows = new Map<string, Record<string, unknown>>();

function notificationQuery() {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let orderAsc: boolean | null = null;
  let limitN: number | null = null;
  let mode: "select" | "insert" | "update" = "select";
  let payload: Record<string, unknown> | null = null;

  const api: Record<string, unknown> = {
    insert(row: Record<string, unknown>) {
      mode = "insert";
      payload = row;
      return api;
    },
    update(row: Record<string, unknown>) {
      mode = "update";
      payload = row;
      return api;
    },
    select() {
      return api;
    },
    eq(col: string, value: unknown) {
      filters.push((row) => row[col] === value);
      return api;
    },
    is(col: string, value: null) {
      filters.push((row) => row[col] == null);
      void value;
      return api;
    },
    order(_col: string, opts?: { ascending?: boolean }) {
      orderAsc = opts?.ascending ?? true;
      return api;
    },
    limit(n: number) {
      limitN = n;
      return api;
    },
    async maybeSingle() {
      if (mode === "insert" && payload) {
        const key = String(payload.notification_id);
        const conflict = [...notificationRows.values()].find(
          (r) =>
            r.owner_id === payload!.owner_id &&
            r.idempotency_key === payload!.idempotency_key &&
            r.deleted_at == null,
        );
        if (conflict) {
          return {
            data: null,
            error: { code: "23505", message: "duplicate" },
          };
        }
        notificationRows.set(key, { ...payload });
        return { data: { ...payload }, error: null };
      }
      const rows = [...notificationRows.values()].filter((row) =>
        filters.every((f) => f(row)),
      );
      if (mode === "update" && payload) {
        const target = rows[0];
        if (!target) return { data: null, error: null };
        Object.assign(target, payload);
        return { data: { ...target }, error: null };
      }
      return { data: rows[0] ?? null, error: null };
    },
    then(resolve: (value: { data: unknown; error: null }) => unknown) {
      let rows = [...notificationRows.values()].filter((row) =>
        filters.every((f) => f(row)),
      );
      if (orderAsc != null) {
        rows = rows.sort((a, b) => {
          const av = String(a.created_at ?? "");
          const bv = String(b.created_at ?? "");
          return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return Promise.resolve(resolve({ data: rows, error: null }));
    },
  };
  return api;
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    from: (table: string) => {
      if (table === "atlas_user_notifications") {
        return notificationQuery();
      }
      return {
        upsert: async (row: {
          user_id: string;
          domain: string;
          payload: unknown;
        }) => {
          if (table !== "atlas_user_state") return { error: null };
          sbStore.set(`${row.user_id}:${row.domain}`, row.payload);
          return { error: null };
        },
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                return { data: null, error: null };
              },
            }),
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/persistence/supabase-user-state", async () => {
  const counters = await import("@/lib/persistence/call-counters");
  return {
    ATLAS_USER_STATE_TABLE: "atlas_user_state",
    upsertSupabaseUserState: async (
      userId: string,
      domain: string,
      payload: unknown,
    ) => {
      sbStore.set(`${userId}:${domain}`, payload);
      counters.bumpPersistenceCounter("supabaseUserStateUpsert");
      return true;
    },
    loadSupabaseUserState: async <T,>(userId: string, domain: string) => {
      const payload = sbStore.get(`${userId}:${domain}`);
      if (!payload) return null;
      counters.bumpPersistenceCounter("supabaseUserStateLoad");
      return { payload: payload as T, updatedAt: new Date().toISOString() };
    },
    listSupabaseUserIdsForDomain: async () => [],
    deleteSupabaseUserDomains: async () => true,
  };
});

vi.mock("@/lib/persistence/with-timeout", () => ({
  withPersistenceTimeout: async <T,>(fn: () => Promise<T>) => fn(),
}));

vi.mock("@/lib/persistence/production-guard", () => ({
  warnIfProductionSupabaseServiceRoleMissing: () => undefined,
}));

import {
  getPersistenceCounters,
  resetPersistenceCounters,
} from "@/lib/persistence/call-counters";
import {
  persistDurableDomain,
  pruneOversizedClerkDurableDomains,
  resetClerkPointerCacheForTests,
} from "@/lib/persistence/durable-domain";
import { setCachedVisionAnalysis } from "@/lib/vision/cache";
import { appendVisionCostRecord } from "@/lib/vision/cost";
import { persistWorkJob } from "@/lib/work-jobs/durable";
import { createNotification } from "@/lib/notifications/service";
import { persistNotificationsNow } from "@/lib/notifications/durable";
import { schedulePersistWorkMemory } from "@/lib/work-memory/durable";
import { schedulePersistLearning } from "@/lib/learning-engine/durable";
import { persistCommanderRunToClerk } from "@/lib/commander/durable-store";
import type { CommanderRunRecord } from "@/lib/commander/types";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import {
  WorkflowState,
  type WorkflowStateRecord,
} from "@/lib/orchestration/workflow-state";

process.env.CLERK_SECRET_KEY = "sk_test_persistence_repeat";
process.env.ATLAS_FORCE_EPHEMERAL_FS = "1";
process.env.VERCEL = "1";
process.env.VERCEL_ENV = "production";
// P0-4: Production inbox requires service-role env (mock client handles rows).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "service_role_test_key";

const USER = "user_persist_repeat_10";
const ASSIGNMENT = "この画像を解析してWordにしてください";

function workflowRecord(state: WorkflowState = WorkflowState.Completed): WorkflowStateRecord {
  return {
    workflowId: "wf-persist-repeat-test",
    state,
    transitions: [],
    updatedAt: new Date().toISOString(),
  };
}

function fakeOrchestrationResult(
  overrides: Partial<OrchestrationResult> = {},
): OrchestrationResult {
  return {
    assignment: ASSIGNMENT,
    status: "completed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: emptyDeliverable("document"),
    reviewComments: "",
    approved: true,
    finalResponse: "Wordを作成しました",
    totalDurationMs: 1,
    workflow: workflowRecord(),
    ...overrides,
  };
}

function fakeCommanderRun(i: number): CommanderRunRecord {
  return {
    id: `run_${i}`,
    userId: USER,
    assignment: ASSIGNMENT,
    status: "completed",
    plan: {
      assignment: ASSIGNMENT,
      classification: {
        deliverableType: "document",
        templateId: "generic",
        summary: "Word作成",
        keywords: [],
      },
      requiredAis: [],
      requiredExternalServices: [],
      requiredTemplate: {
        templateId: "generic",
        label: "general",
        stepIds: [],
        stepLabels: [],
      },
      requiredMemory: {
        workMemoryIds: [],
        workMemoryTitles: [],
        workMemoryTypes: [],
        learningKeys: [],
        summary: "",
      },
      executionOrder: [],
      maxRetries: 2,
      generatedAt: new Date().toISOString(),
    },
    confirmationReasons: [],
    attempts: [],
    result: fakeOrchestrationResult({
      fileDeliverables: [],
    }),
    error: null,
    workflowRunId: null,
    cancelRequested: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function simulateOneJobCycle(index: number): Promise<{
  jobId: string;
  durationMs: number;
  ok: boolean;
}> {
  const started = Date.now();
  const jobId = `job_repeat_${index}_${crypto.randomUUID().slice(0, 8)}`;

  // queued
  let persist = await persistWorkJob({
    id: jobId,
    userId: USER,
    assignment: ASSIGNMENT,
    idempotencyKey: `idem_${jobId}`,
    metadata: { jobId, workJobId: jobId, attachmentIds: [`img_${index}`] },
    status: "queued",
    attemptCount: 0,
    maxAttempts: 3,
    error: null,
    visionGate: null,
    result: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  });
  if (persist === "failed") return { jobId, durationMs: Date.now() - started, ok: false };

  // running
  persist = await persistWorkJob({
    id: jobId,
    userId: USER,
    assignment: ASSIGNMENT,
    idempotencyKey: `idem_${jobId}`,
    metadata: { jobId, workJobId: jobId, attachmentIds: [`img_${index}`] },
    status: "running",
    attemptCount: 1,
    maxAttempts: 3,
    error: null,
    visionGate: null,
    result: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  });
  if (persist === "failed") return { jobId, durationMs: Date.now() - started, ok: false };

  // vision cache + cost (must not touch /var/task)
  await setCachedVisionAnalysis({
    userId: USER,
    contentHash: `hash_${index}`,
    detail: "high",
    promptVersion: "v2",
    result: {
      id: `vis_${index}`,
      attachmentId: `img_${index}`,
      detectedType: "receipt",
      confidence: 0.9,
      summary: "レシート",
      extractedText: null,
      language: "ja",
      fields: {},
      tables: [],
      visualElements: [],
      layout: null,
      styleSignals: null,
      warnings: [],
      missingFields: [],
      recommendedActions: [],
      artifactSuggestions: ["docx"],
      model: "atlas-mock",
      detailLevel: "high",
      createdAt: new Date().toISOString(),
    },
  });
  await appendVisionCostRecord({
    userId: USER,
    jobId,
    imageCount: 1,
    originalBytes: 1000,
    processedBytes: 1000,
    detailLevel: "high",
    model: "atlas-mock",
    inputTokens: 10,
    outputTokens: 10,
    estimatedCostUsd: 0.001,
    durationMs: 5,
    success: true,
    cached: false,
    createdAt: new Date().toISOString(),
  });

  // commander terminal persist
  await persistCommanderRunToClerk(fakeCommanderRun(index));

  // memory / learning / notification
  schedulePersistWorkMemory(USER);
  schedulePersistLearning(USER);
  await createNotification(
    {
      userId: USER,
      audience: "user",
      type: "completed",
      title: "完了",
      message: `job ${jobId} 完了`,
      lineEvent: "work_completed",
      eventCategory: "final_success",
      targetType: "deliverable",
      targetId: `dlv_${index}`,
      deliverableId: `dlv_${index}`,
      requestId: jobId,
    },
    { skipDelivery: true },
  );
  await persistNotificationsNow(USER);

  // completed
  persist = await persistWorkJob({
    id: jobId,
    userId: USER,
    assignment: ASSIGNMENT,
    idempotencyKey: `idem_${jobId}`,
    metadata: {
      jobId,
      workJobId: jobId,
      attachmentIds: [`img_${index}`],
      visionDeliverablesOk: true,
      visionDeliverablesDownloadable: true,
    },
    status: "completed",
    attemptCount: 1,
    maxAttempts: 3,
    error: null,
    visionGate: null,
    result: fakeOrchestrationResult({
      finalResponse: "Wordを作成しました",
      fileDeliverables: [
        {
          id: `dlv_${index}`,
          format: "docx",
          fileName: "report.docx",
          downloadUrl: `/api/deliverables/dlv_${index}`,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          generatedAt: new Date().toISOString(),
          sizeBytes: 1000,
          isPlaceholder: false,
        },
      ],
    }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });

  return {
    jobId,
    durationMs: Date.now() - started,
    ok: persist !== "failed",
  };
}

describe("persistence repeat ×10 (Vercel ephemeral)", () => {
  beforeEach(() => {
    clerkMeta.clear();
    clerkUpdateCalls = 0;
    sbStore.clear();
    notificationRows.clear();
    resetPersistenceCounters();
    resetClerkPointerCacheForTests();
    // Seed oversized legacy Clerk payloads once — prune must migrate, not truncate-as-success.
    clerkMeta.set(USER, {
      atlasWorkJobs: {
        version: 1,
        payload: { jobs: [{ id: "legacy", blob: "x".repeat(3000) }] },
      },
      atlasCommanderRuns: {
        version: 1,
        payload: { runs: [{ id: "legacy_run", blob: "y".repeat(3000) }] },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("migrates legacy Clerk blobs then survives 10 consecutive job cycles", async () => {
    const prune = await pruneOversizedClerkDurableDomains(USER);
    expect(prune.migrated.length).toBeGreaterThan(0);

    // After prune, leftover keys cleared — pointer cache empty.
    resetClerkPointerCacheForTests();
    clerkUpdateCalls = 0;
    resetPersistenceCounters();

    const results: Array<{ jobId: string; durationMs: number; ok: boolean }> =
      [];
    for (let i = 1; i <= 10; i += 1) {
      results.push(await simulateOneJobCycle(i));
    }

    const failed = results.filter((r) => !r.ok);
    const counters = getPersistenceCounters();
    const report = {
      jobIds: results.map((r) => r.jobId),
      durationsMs: results.map((r) => r.durationMs),
      successRate: `${((10 - failed.length) / 10) * 100}%`,
      failedCount: failed.length,
      clerkUpdateMetadata: counters.clerkUpdateMetadata,
      clerkGetUser: counters.clerkGetUser,
      clerkUpdateCallsRaw: clerkUpdateCalls,
      supabaseUserStateUpsert: counters.supabaseUserStateUpsert,
      notificationCreate: counters.notificationCreate,
      workMemoryPersist: counters.workMemoryPersist,
      learningPersist: counters.learningPersist,
      commanderPersist: counters.commanderPersist,
      workJobPersist: counters.workJobPersist,
      processCwdDataDirAttempts: counters.processCwdDataDirAttempts,
      processCwdDataDirBlocked: counters.processCwdDataDirBlocked,
      clerk8kbErrors: counters.clerk8kbErrors,
      clerk429Errors: counters.clerk429Errors,
      finalClerkBytes: new TextEncoder().encode(
        JSON.stringify(clerkMeta.get(USER) ?? {}),
      ).length,
    };

    // Evidence artifact for the completion report.
     
    console.info("[persistence-repeat-10]", JSON.stringify(report, null, 2));

    expect(failed.length, JSON.stringify(report)).toBe(0);
    expect(results).toHaveLength(10);
    expect(counters.processCwdDataDirAttempts).toBe(0);
    expect(counters.clerk8kbErrors).toBe(0);
    expect(counters.clerk429Errors).toBe(0);
    expect(report.finalClerkBytes).toBeLessThanOrEqual(8192);
    expect(counters.workJobPersist).toBe(30);
    expect(counters.supabaseUserStateUpsert).toBeGreaterThan(0);
    // Heavy domains must not remain in Clerk after clear + 10 cycles.
    expect(Object.keys(clerkMeta.get(USER) ?? {})).not.toContain("atlasWorkJobs");
    expect(Object.keys(clerkMeta.get(USER) ?? {})).not.toContain(
      "atlasCommanderRuns",
    );
    expect(Object.keys(clerkMeta.get(USER) ?? {})).not.toContain(
      "atlasNotifications",
    );
  });

  it("forceSupabase domains never embed job arrays into Clerk", async () => {
    resetClerkPointerCacheForTests();
    await persistDurableDomain(
      USER,
      "atlasWorkJobs",
      {
        jobs: [
          {
            id: "j1",
            result: { finalResponse: "x".repeat(5000) },
          },
        ],
      },
      { forceSupabase: true, compact: (p) => p },
    );
    expect(clerkMeta.get(USER)?.atlasWorkJobs).toBeUndefined();
    const sb = sbStore.get(`${USER}:atlasWorkJobs`) as {
      payload: { jobs: unknown[] };
    };
    expect(sb.payload.jobs).toHaveLength(1);
  });
});
