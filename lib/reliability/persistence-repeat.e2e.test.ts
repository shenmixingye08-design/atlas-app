/**
 * Persistence reliability: same job path × 10 under Vercel-like constraints.
 * Proves Clerk pointer-once, no /var/task writes, no 8KB / 429.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerkMeta = new Map<string, Record<string, unknown>>();
let clerkUpdateCalls = 0;
let clerkGetCalls = 0;

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUser: async (userId: string) => {
        clerkGetCalls += 1;
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

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    from: (table: string) => ({
      upsert: async (row: { user_id: string; domain: string; payload: unknown }) => {
        if (table !== "atlas_user_state") return { error: null };
        sbStore.set(`${row.user_id}:${row.domain}`, row.payload);
        return { error: null };
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => {
              // filled by chain below — simplified in load path mock
              return { data: null, error: null };
            },
          }),
        }),
      }),
    }),
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
import { persistClerkPrivateMetadataKey } from "@/lib/persistence/clerk-private-metadata";
import { setCachedVisionAnalysis } from "@/lib/vision/cache";
import { appendVisionCostRecord } from "@/lib/vision/cost";
import { persistWorkJob } from "@/lib/work-jobs/durable";
import { createNotification } from "@/lib/notifications/service";
import { persistNotificationsNow } from "@/lib/notifications/durable";
import { schedulePersistWorkMemory } from "@/lib/work-memory/durable";
import { schedulePersistLearning } from "@/lib/learning-engine/durable";
import { persistCommanderRunToClerk } from "@/lib/commander/durable-store";
import type { CommanderRunRecord } from "@/lib/commander/types";

process.env.CLERK_SECRET_KEY = "sk_test_persistence_repeat";
process.env.ATLAS_FORCE_EPHEMERAL_FS = "1";
process.env.VERCEL = "1";
process.env.VERCEL_ENV = "production";

const USER = "user_persist_repeat_10";
const ASSIGNMENT = "この画像を解析してWordにしてください";

function fakeCommanderRun(i: number): CommanderRunRecord {
  return {
    id: `run_${i}`,
    userId: USER,
    assignment: ASSIGNMENT,
    status: "completed",
    plan: {
      classification: {
        category: "document",
        confidence: 1,
        summary: "Word作成",
        reasons: [],
      },
      requiredAis: [],
      requiredDepartments: [],
      requiredExternalServices: [],
      requiredTemplate: { id: null, label: "general", reason: null },
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
      title: "t",
      summary: "s",
      phases: [],
      selectedAis: [],
      externalServices: [],
      templateId: null,
      templateLabel: "general",
      estimatedSteps: 1,
      memoryHints: [],
      automationHint: null,
    } as unknown as CommanderRunRecord["plan"],
    confirmationReasons: [],
    attempts: [],
    result: {
      finalResponse: "Wordを作成しました",
      fileDeliverables: [],
    } as CommanderRunRecord["result"],
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
  createNotification({
    userId: USER,
    audience: "user",
    type: "work_completed",
    title: "完了",
    message: `job ${jobId} 完了`,
    targetType: "deliverable",
    targetId: `dlv_${index}`,
    deliverableId: `dlv_${index}`,
  });
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
    result: {
      finalResponse: "Wordを作成しました",
      fileDeliverables: [
        {
          id: `dlv_${index}`,
          format: "docx",
          fileName: "report.docx",
          downloadUrl: `/api/deliverables/dlv_${index}`,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          sizeBytes: 1000,
          isPlaceholder: false,
        },
      ],
    } as never,
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
    clerkGetCalls = 0;
    sbStore.clear();
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
    // eslint-disable-next-line no-console
    console.info("[persistence-repeat-10]", JSON.stringify(report, null, 2));

    expect(failed.length, JSON.stringify(report)).toBe(0);
    expect(results).toHaveLength(10);
    expect(counters.processCwdDataDirAttempts).toBe(0);
    expect(counters.clerk8kbErrors).toBe(0);
    expect(counters.clerk429Errors).toBe(0);
    expect(report.finalClerkBytes).toBeLessThanOrEqual(8192);
    // Pointer-once: Clerk updates stay far below old ~30+/job × 10.
    expect(counters.clerkUpdateMetadata).toBeLessThan(40);
    expect(counters.workJobPersist).toBe(30); // 3 durable saves × 10
    expect(counters.supabaseUserStateUpsert).toBeGreaterThan(0);

    // Clerk values are pointers only (no heavy payloads).
    for (const value of Object.values(clerkMeta.get(USER) ?? {})) {
      if (!value || typeof value !== "object") continue;
      const envelope = value as { payload?: unknown; storedInSupabase?: boolean };
      if ("storedInSupabase" in envelope) {
        expect(envelope.storedInSupabase).toBe(true);
        expect(envelope.payload == null).toBe(true);
      }
    }
  });

  it("partial Clerk update does not rewrite sibling keys (8KB safety)", async () => {
    clerkMeta.set(USER, {
      lightSetting: { theme: "system" },
    });
    const ok = await persistClerkPrivateMetadataKey(USER, "atlasWorkJobs", {
      version: 1,
      storedInSupabase: true,
      id: "atlasWorkJobs",
      payload: null,
    });
    expect(ok).toBe(true);
    expect(clerkMeta.get(USER)?.lightSetting).toEqual({ theme: "system" });
    expect(
      (clerkMeta.get(USER)?.atlasWorkJobs as { payload: unknown }).payload,
    ).toBeNull();
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
    const clerkValue = clerkMeta.get(USER)?.atlasWorkJobs as {
      payload: unknown;
      storedInSupabase: boolean;
    };
    expect(clerkValue.storedInSupabase).toBe(true);
    expect(clerkValue.payload).toBeNull();
    const sb = sbStore.get(`${USER}:atlasWorkJobs`) as {
      payload: { jobs: unknown[] };
    };
    expect(sb.payload.jobs).toHaveLength(1);
  });
});
