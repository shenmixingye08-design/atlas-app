import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const updateUserMetadata = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUser,
      updateUserMetadata,
    },
  }),
}));

import {
  clearClerkPrivateMetadataKeys,
  loadClerkPrivateMetadataKey,
  persistClerkPrivateMetadataKey,
} from "./clerk-private-metadata";
import { createN08ProbeOwnerIds } from "@/lib/health/internal-probe-user";
import {
  persistDurableDomain,
  resetClerkPointerCacheForTests,
} from "./durable-domain";

const upsertSb = vi.fn<(userId: string, domain: string, payload: unknown) => Promise<boolean>>(
  async () => true,
);
const loadSb = vi.fn<(userId: string, domain: string) => Promise<null>>(
  async () => null,
);

vi.mock("./supabase-user-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supabase-user-state")>();
  return {
    ...actual,
    upsertSupabaseUserState: (
      userId: string,
      domain: string,
      payload: unknown,
    ) => upsertSb(userId, domain, payload),
    loadSupabaseUserState: (userId: string, domain: string) =>
      loadSb(userId, domain),
  };
});

describe("Clerk remote skip for internal probe users", () => {
  beforeEach(() => {
    getUser.mockReset();
    updateUserMetadata.mockReset();
    upsertSb.mockReset();
    loadSb.mockReset();
    getUser.mockResolvedValue({ privateMetadata: {} });
    updateUserMetadata.mockResolvedValue({});
    upsertSb.mockResolvedValue(true);
    loadSb.mockResolvedValue(null);
    resetClerkPointerCacheForTests();
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_probe");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "n07_user_a_12ab34cd",
    "n08_probe_a_deadbeef",
    "user_n05_mem_a_run1",
    "user_p302_probe_a",
  ])("skips Clerk remote for %s", async (userId) => {
    await expect(
      loadClerkPrivateMetadataKey(userId, "atlasNotifications"),
    ).resolves.toBeNull();
    await expect(
      persistClerkPrivateMetadataKey(userId, "atlasNotifications", { v: 1 }),
    ).resolves.toBe(false);
    await expect(
      clearClerkPrivateMetadataKeys(userId, ["atlasNotifications"]),
    ).resolves.toBe(false);
    expect(getUser).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  it("does not call Clerk get/update for generated n08 probe owners", async () => {
    const { ownerA } = createN08ProbeOwnerIds();
    await expect(
      loadClerkPrivateMetadataKey(ownerA, "atlasAutomations"),
    ).resolves.toBeNull();
    await expect(
      persistClerkPrivateMetadataKey(ownerA, "atlasAutomations", { ok: true }),
    ).resolves.toBe(false);
    await expect(
      clearClerkPrivateMetadataKeys(ownerA, ["atlasAutomations"]),
    ).resolves.toBe(false);
    expect(getUser).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  it("still calls Clerk for a real user when needed", async () => {
    await loadClerkPrivateMetadataKey("user_2abcRealClerkId", "atlasTest");
    expect(getUser).toHaveBeenCalledTimes(1);
    await persistClerkPrivateMetadataKey("user_2abcRealClerkId", "atlasTest", {
      hello: true,
    });
    expect(updateUserMetadata).toHaveBeenCalled();
  });

  it("does not hit Clerk when persisting supabase-only notifications for n07 users", async () => {
    await persistDurableDomain(
      "n07_user_a_12ab34cd",
      "atlasNotifications",
      { notifications: [], preferences: {} },
      { compact: (p) => p, forceSupabase: true },
    );
    expect(getUser).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
    expect(upsertSb).toHaveBeenCalled();
  });
});
