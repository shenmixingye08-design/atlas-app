import { beforeEach, describe, expect, it, vi } from "vitest";

const persistClerk = vi.fn(async () => true);
const loadClerk = vi.fn(async () => null);
const upsertSb = vi.fn(async () => false);
const loadSb = vi.fn(async () => null);

vi.mock("@/lib/persistence/clerk-private-metadata", () => ({
  persistClerkPrivateMetadataKey: (...args: unknown[]) => persistClerk(...args),
  loadClerkPrivateMetadataKey: (...args: unknown[]) => loadClerk(...args),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: (...args: unknown[]) => upsertSb(...args),
  loadSupabaseUserState: (...args: unknown[]) => loadSb(...args),
}));

import {
  CLERK_DOMAIN_SAFE_BYTES,
  loadDurableDomain,
  persistDurableDomain,
} from "./durable-domain";

describe("durable-domain", () => {
  beforeEach(() => {
    persistClerk.mockClear();
    loadClerk.mockClear();
    upsertSb.mockClear();
    loadSb.mockClear();
    persistClerk.mockResolvedValue(true);
    upsertSb.mockResolvedValue(false);
    loadClerk.mockResolvedValue(null);
    loadSb.mockResolvedValue(null);
  });

  it("stores small payloads in Clerk only", async () => {
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

  it("overflows to Supabase when payload exceeds Clerk safe bytes", async () => {
    upsertSb.mockResolvedValue(true);
    const huge = { blob: "x".repeat(CLERK_DOMAIN_SAFE_BYTES + 100) };
    const result = await persistDurableDomain("user_1", "atlasTest", huge, {
      compact: () => ({ blob: "tiny" }),
    });
    expect(result).toBe("supabase");
    expect(upsertSb).toHaveBeenCalled();
    expect(persistClerk).toHaveBeenCalled();
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

  it("loads Supabase payload when Clerk marks storedInSupabase", async () => {
    loadClerk.mockResolvedValue({
      version: 1,
      updatedAt: new Date().toISOString(),
      storedInSupabase: true,
      payload: { blob: "compact" },
    });
    loadSb.mockResolvedValue({
      payload: {
        version: 1,
        updatedAt: new Date().toISOString(),
        payload: { blob: "full" },
      },
      updatedAt: new Date().toISOString(),
    });

    const loaded = await loadDurableDomain<{ blob: string }>("user_1", "atlasTest");
    expect(loaded).toEqual({ blob: "full" });
  });
});
