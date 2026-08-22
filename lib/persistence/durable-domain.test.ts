import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  clearClerkPrivateMetadataKeys,
  loadClerkPrivateMetadataKey,
  persistClerkPrivateMetadataKey,
} from "@/lib/persistence/clerk-private-metadata";
import type {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";
import type { DurableDomainEnvelope } from "./durable-domain";

const persistClerk = vi.fn<typeof persistClerkPrivateMetadataKey>(
  async () => true,
);
const loadClerk = vi.fn<typeof loadClerkPrivateMetadataKey>(async () => null);
const upsertSb = vi.fn<typeof upsertSupabaseUserState>(async () => false);
const loadSb = vi.fn<typeof loadSupabaseUserState>(async () => null);
const clearClerk = vi.fn<typeof clearClerkPrivateMetadataKeys>(
  async () => true,
);

vi.mock("@/lib/persistence/clerk-private-metadata", () => ({
  persistClerkPrivateMetadataKey: (
    ...args: Parameters<typeof persistClerkPrivateMetadataKey>
  ) => persistClerk(...args),
  loadClerkPrivateMetadataKey: <T,>(
    ...args: Parameters<typeof loadClerkPrivateMetadataKey>
  ) => loadClerk(...args) as ReturnType<typeof loadClerkPrivateMetadataKey<T>>,
  clearClerkPrivateMetadataKeys: (
    ...args: Parameters<typeof clearClerkPrivateMetadataKeys>
  ) => clearClerk(...args),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: (
    ...args: Parameters<typeof upsertSupabaseUserState>
  ) => upsertSb(...args),
  loadSupabaseUserState: <T,>(
    ...args: Parameters<typeof loadSupabaseUserState>
  ) => loadSb(...args) as ReturnType<typeof loadSupabaseUserState<T>>,
}));

import {
  CLERK_DOMAIN_SAFE_BYTES,
  loadDurableDomain,
  persistDurableDomain,
  resetClerkPointerCacheForTests,
} from "./durable-domain";

describe("durable-domain", () => {
  beforeEach(() => {
    persistClerk.mockClear();
    loadClerk.mockClear();
    upsertSb.mockClear();
    loadSb.mockClear();
    clearClerk.mockClear();
    persistClerk.mockResolvedValue(true);
    clearClerk.mockResolvedValue(true);
    upsertSb.mockResolvedValue(false);
    loadClerk.mockResolvedValue(null);
    loadSb.mockResolvedValue(null);
    resetClerkPointerCacheForTests();
  });

  it("stores small non-forced payloads in Clerk only", async () => {
    const result = await persistDurableDomain(
      "user_1",
      "atlasTest",
      { hello: "world" },
      { compact: (p) => p },
    );
    expect(result).toBe("clerk");
    expect(persistClerk).toHaveBeenCalled();
    expect(upsertSb).not.toHaveBeenCalled();
  });

  it("forceSupabase writes only to Supabase and clears heavy Clerk keys (no payload rewrite)", async () => {
    upsertSb.mockResolvedValue(true);
    const jobs = { jobs: [{ id: "j1", blob: "x".repeat(1000) }] };
    const first = await persistDurableDomain("user_1", "atlasWorkJobs", jobs, {
      forceSupabase: true,
      compact: () => ({ jobs: [] }),
    });
    const second = await persistDurableDomain("user_1", "atlasWorkJobs", jobs, {
      forceSupabase: true,
      compact: () => ({ jobs: [] }),
    });
    expect(first).toBe("supabase");
    expect(second).toBe("supabase");
    expect(upsertSb).toHaveBeenCalled();
    // No routine pointer/payload writes for supabase-only domains.
    expect(persistClerk).not.toHaveBeenCalled();
    expect(clearClerk).toHaveBeenCalled();
  });

  it("overflows oversized non-forced domains to Supabase without Clerk payload", async () => {
    upsertSb.mockResolvedValue(true);
    const huge = { blob: "x".repeat(CLERK_DOMAIN_SAFE_BYTES + 100) };
    const result = await persistDurableDomain("user_1", "atlasTest", huge, {
      compact: () => ({ blob: "tiny" }),
    });
    expect(result).toBe("supabase");
    expect(upsertSb).toHaveBeenCalled();
    expect(persistClerk).not.toHaveBeenCalled();
  });

  it("does not pretend success with clerk_compact in production when Supabase fails", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    upsertSb.mockResolvedValue(false);
    const huge = { blob: "x".repeat(CLERK_DOMAIN_SAFE_BYTES + 100) };
    const result = await persistDurableDomain("user_1", "atlasTest", huge, {
      compact: () => ({ blob: "tiny" }),
    });
    expect(result).toBe("skipped");
    expect(persistClerk).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("allows clerk_compact only outside production when Supabase fails", async () => {
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NODE_ENV", "development");
    upsertSb.mockResolvedValue(false);
    const huge = { blob: "x".repeat(CLERK_DOMAIN_SAFE_BYTES + 100) };
    const result = await persistDurableDomain("user_1", "atlasTest", huge, {
      compact: () => ({ blob: "tiny" }),
    });
    expect(result).toBe("clerk_compact");
    vi.unstubAllEnvs();
  });

  it("does not treat atlasNotifications skip as Clerk success", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    upsertSb.mockResolvedValue(false);
    const result = await persistDurableDomain(
      "user_1",
      "atlasNotifications",
      { notifications: [], preferences: {} },
      { compact: (p) => p, forceSupabase: true },
    );
    expect(result).toBe("skipped");
    expect(persistClerk).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("skips Clerk cleanup for n07 probe users while still writing Supabase", async () => {
    upsertSb.mockResolvedValue(true);
    const result = await persistDurableDomain(
      "n07_user_a_deadbeef",
      "atlasNotifications",
      { notifications: [], preferences: {} },
      { compact: (p) => p, forceSupabase: true },
    );
    expect(result).toBe("supabase");
    expect(loadClerk).not.toHaveBeenCalled();
    expect(clearClerk).not.toHaveBeenCalled();
    expect(upsertSb).toHaveBeenCalled();
  });

  it("loads Supabase payload for supabase-only domains without Clerk", async () => {
    const row = {
      payload: {
        version: 1,
        updatedAt: new Date().toISOString(),
        payload: { blob: "full" },
      },
      updatedAt: new Date().toISOString(),
    } satisfies Awaited<
      ReturnType<typeof loadSupabaseUserState<DurableDomainEnvelope<{ blob: string }>>>
    >;
    loadSb.mockResolvedValue(row);

    const loaded = await loadDurableDomain<{ blob: string }>(
      "user_1",
      "atlasWorkJobs",
    );
    expect(loaded).toEqual({ blob: "full" });
    expect(loadClerk).not.toHaveBeenCalled();
  });
});
