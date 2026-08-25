import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
const updateUserMetadata = vi.fn();
const deleteUser = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: { getUser, updateUserMetadata, deleteUser },
  }),
}));

import {
  MEMORY_APPLY_HEALTH_MAX_ATTEMPTS,
  nextMemoryApplyHealthAttemptAllowed,
  probeMemoryApplyProduction,
  shouldRetryMemoryApplyHealth,
} from "@/lib/memory-apply/memory-apply-production-probe";
import {
  createN05MemoryProbeUserIds,
  isInternalProbeIdentity,
} from "@/lib/health/internal-probe-user";
import { resetClerkPointerCacheForTests } from "@/lib/persistence/durable-domain";
import { resetPersistenceCounters } from "@/lib/persistence/call-counters";

describe("memory-apply health probe isolation", () => {
  beforeEach(() => {
    getUser.mockReset();
    updateUserMetadata.mockReset();
    deleteUser.mockReset();
    resetClerkPointerCacheForTests();
    resetPersistenceCounters();
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_n05_isolation");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("classifies user_n05_mem_test123 as a probe and generic user_* as a real Clerk id", () => {
    expect(isInternalProbeIdentity("user_n05_mem_test123")).toBe(true);
    expect(isInternalProbeIdentity("user_...")).toBe(false);
    expect(isInternalProbeIdentity("user_2abcRealClerkId")).toBe(false);
  });

  it("never retries Clerk 404/429 or deadline paths", () => {
    expect(shouldRetryMemoryApplyHealth("Clerk 404 Not Found")).toBe(false);
    expect(shouldRetryMemoryApplyHealth("429 Too Many Requests")).toBe(false);
    expect(shouldRetryMemoryApplyHealth("Task timed out after 60 seconds")).toBe(
      false,
    );
    expect(shouldRetryMemoryApplyHealth("deadline_reached")).toBe(false);
    expect(shouldRetryMemoryApplyHealth("supabase_service_role_not_configured")).toBe(
      false,
    );
    expect(shouldRetryMemoryApplyHealth("persist_b_skipped")).toBe(true);
  });

  it("bounds simulated mass iteration to the soft deadline", () => {
    const startedAtMs = 1_000;
    let attempts = 0;
    let nowMs = startedAtMs;
    while (
      nextMemoryApplyHealthAttemptAllowed({
        attemptsUsed: attempts,
        maxAttempts: 99,
        startedAtMs,
        softDeadlineMs: 40,
        nowMs,
      })
    ) {
      attempts += 1;
      nowMs += 20;
    }
    expect(attempts).toBeLessThanOrEqual(MEMORY_APPLY_HEALTH_MAX_ATTEMPTS);
    expect(attempts).toBeLessThanOrEqual(2);
    expect(nowMs - startedAtMs).toBeLessThanOrEqual(80);
  });

  it("finishes immediately when the soft deadline has already elapsed", async () => {
    const started = Date.now();
    const result = await probeMemoryApplyProduction({
      softDeadlineMs: 0,
      maxAttempts: 20,
    });
    expect(result.deadlineReached).toBe(true);
    expect(result.totalDurationMs ?? 0).toBeLessThan(5_000);
    expect(result.iterations ?? 0).toBeLessThanOrEqual(2);
    expect(result.clerkCalls ?? 0).toBe(0);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(getUser).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("runs five consecutive probes with zero Clerk calls and no timeout", async () => {
    const rows = [];
    for (let i = 0; i < 5; i += 1) {
      const result = await probeMemoryApplyProduction({
        softDeadlineMs: 40_000,
        maxAttempts: 2,
      });
      rows.push(result);
      expect(result.clerkCalls).toBe(0);
      expect(result.totalDurationMs ?? 0).toBeLessThan(60_000);
      expect(result.deadlineReached).toBeTypeOf("boolean");
    }
    expect(rows).toHaveLength(5);
    expect(getUser).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("records clerkCalls=0 while persisting N-05 probe memory to Supabase-only", async () => {
    const { probeUserA } = createN05MemoryProbeUserIds("iso1");
    const { loadClerkPrivateMetadataKey, persistClerkPrivateMetadataKey, clearClerkPrivateMetadataKeys } =
      await import("@/lib/persistence/clerk-private-metadata");

    await expect(
      loadClerkPrivateMetadataKey(probeUserA, "atlasPersonalMemory"),
    ).resolves.toBeNull();
    await expect(
      persistClerkPrivateMetadataKey(probeUserA, "atlasPersonalMemory", {
        memories: [],
      }),
    ).resolves.toBe(false);
    await expect(
      clearClerkPrivateMetadataKeys(probeUserA, ["atlasPersonalMemory"]),
    ).resolves.toBe(false);

    expect(getUser).toHaveBeenCalledTimes(0);
    expect(updateUserMetadata).toHaveBeenCalledTimes(0);
    expect(deleteUser).toHaveBeenCalledTimes(0);
  });
});
