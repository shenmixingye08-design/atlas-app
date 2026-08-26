import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const persistDurableDomain = vi.fn(async () => "supabase");

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: (...args: unknown[]) => persistDurableDomain(...args),
  loadDurableDomain: vi.fn(async () => null),
}));

import { createN08ProbeOwnerIds } from "@/lib/health/internal-probe-user";
import { persistNotificationsNow } from "./durable";

describe("notification persist skips internal probe identities", () => {
  beforeEach(() => {
    persistDurableDomain.mockClear();
  });

  it("does not write atlasNotifications for probe users", async () => {
    const { ownerA } = createN08ProbeOwnerIds();
    await persistNotificationsNow(ownerA);
    expect(persistDurableDomain).not.toHaveBeenCalled();
  });

  it("writes supabase for real users", async () => {
    await persistNotificationsNow("user_real_notify");
    expect(persistDurableDomain).toHaveBeenCalled();
    expect(persistDurableDomain.mock.calls[0]?.[1]).toBe("atlasNotifications");
  });
});
