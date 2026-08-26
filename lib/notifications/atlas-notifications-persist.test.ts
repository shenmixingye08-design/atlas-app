import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { upsertSb, loadSb } = vi.hoisted(() => ({
  upsertSb: vi.fn(async () => true),
  loadSb: vi.fn(
    async (): Promise<{ payload: unknown; updatedAt: string } | null> => null,
  ),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: upsertSb,
  loadSupabaseUserState: loadSb,
}));

vi.mock("@/lib/persistence/clerk-private-metadata", () => ({
  persistClerkPrivateMetadataKey: vi.fn(async () => false),
  loadClerkPrivateMetadataKey: vi.fn(async () => null),
  clearClerkPrivateMetadataKeys: vi.fn(async () => true),
}));

import { persistDurableDomain, resetClerkPointerCacheForTests } from "@/lib/persistence/durable-domain";
import { NOTIFICATIONS_DOMAIN_KEY } from "./durable";

describe("atlasNotifications supabase persistence", () => {
  beforeEach(() => {
    upsertSb.mockClear();
    loadSb.mockClear();
    upsertSb.mockResolvedValue(true);
    loadSb.mockResolvedValue(null);
    resetClerkPointerCacheForTests();
  });

  it("inserts, upserts, and reads back the same payload", async () => {
    const payload = {
      notifications: [{ notificationId: "ntf_1", title: "done" }],
      preferences: { allEnabled: true },
    };
    const inserted = await persistDurableDomain(
      "user_notify_1",
      NOTIFICATIONS_DOMAIN_KEY,
      payload,
      { forceSupabase: true, compact: (p) => p },
    );
    expect(inserted).toBe("supabase");
    expect(upsertSb).toHaveBeenCalledTimes(1);

    const upserted = await persistDurableDomain(
      "user_notify_1",
      NOTIFICATIONS_DOMAIN_KEY,
      payload,
      { forceSupabase: true, compact: (p) => p },
    );
    expect(upserted).toBe("supabase");
    expect(upsertSb).toHaveBeenCalledTimes(2);

    loadSb.mockResolvedValue({
      payload: {
        version: 1,
        updatedAt: new Date().toISOString(),
        payload,
      },
      updatedAt: new Date().toISOString(),
    });
    const { loadDurableDomain } = await import(
      "@/lib/persistence/durable-domain"
    );
    const readBack = await loadDurableDomain<typeof payload>(
      "user_notify_1",
      NOTIFICATIONS_DOMAIN_KEY,
    );
    expect(readBack).toEqual(payload);
  });

  it("does not write Clerk when supabase persist succeeds", async () => {
    const { persistClerkPrivateMetadataKey } = await import(
      "@/lib/persistence/clerk-private-metadata"
    );
    await persistDurableDomain(
      "user_notify_2",
      NOTIFICATIONS_DOMAIN_KEY,
      { notifications: [], preferences: {} },
      { forceSupabase: true, compact: (p) => p },
    );
    expect(persistClerkPrivateMetadataKey).not.toHaveBeenCalled();
  });
});
