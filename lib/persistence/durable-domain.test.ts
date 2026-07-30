import { beforeEach, describe, expect, it, vi } from "vitest";

const persistClerk = vi.fn(async () => true);
const loadClerk = vi.fn(async () => null);
const upsertSb = vi.fn(async () => false);
const loadSb = vi.fn(async () => null);
const clearClerk = vi.fn(async () => true);

vi.mock("@/lib/persistence/clerk-private-metadata", () => ({
  persistClerkPrivateMetadataKey: (...args: unknown[]) => persistClerk(...args),
  loadClerkPrivateMetadataKey: (...args: unknown[]) => loadClerk(...args),
  clearClerkPrivateMetadataKeys: (...args: unknown[]) => clearClerk(...args),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: (...args: unknown[]) => upsertSb(...args),
  loadSupabaseUserState: (...args: unknown[]) => loadSb(...args),
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

  it("forceSupabase writes full payload to Supabase and pointer-only to Clerk once", async () => {
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
    expect(upsertSb).toHaveBeenCalledTimes(2);
    // Pointer cached — Clerk written once.
    expect(persistClerk).toHaveBeenCalledTimes(1);
    const clerkValue = persistClerk.mock.calls[0]?.[2] as {
      storedInSupabase?: boolean;
      payload?: unknown;
      id?: string;
    };
    expect(clerkValue.storedInSupabase).toBe(true);
    expect(clerkValue.payload).toBeNull();
    expect(clerkValue.id).toBe("atlasWorkJobs");
  });

  it("overflows oversized non-forced domains to Supabase with Clerk pointer", async () => {
    upsertSb.mockResolvedValue(true);
    const huge = { blob: "x".repeat(CLERK_DOMAIN_SAFE_BYTES + 100) };
    const result = await persistDurableDomain("user_1", "atlasTest", huge, {
      compact: () => ({ blob: "tiny" }),
    });
    expect(result).toBe("supabase");
    expect(upsertSb).toHaveBeenCalled();
    const clerkValue = persistClerk.mock.calls[0]?.[2] as {
      payload?: unknown;
    };
    expect(clerkValue.payload).toBeNull();
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

  it("loads Supabase payload for supabase-only domains without Clerk", async () => {
    loadSb.mockResolvedValue({
      payload: {
        version: 1,
        updatedAt: new Date().toISOString(),
        payload: { blob: "full" },
      },
      updatedAt: new Date().toISOString(),
    });

    const loaded = await loadDurableDomain<{ blob: string }>(
      "user_1",
      "atlasWorkJobs",
    );
    expect(loaded).toEqual({ blob: "full" });
    expect(loadClerk).not.toHaveBeenCalled();
  });
});
