import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const persistNotificationsNow = vi.fn(async () => undefined);
const createUserNotification = vi.fn();

vi.mock("@/lib/notifications/durable", () => ({
  persistNotificationsNow,
  ensureNotificationsHydrated: vi.fn(async () => undefined),
  schedulePersistNotifications: vi.fn(),
}));

vi.mock("@/lib/notifications/service", () => ({
  createUserNotification,
}));

vi.mock("@/lib/feature-flags/resolve-context", () => ({
  resolveFeatureAccessContext: vi.fn(async () => ({
    email: "user@example.com",
    isOwner: false,
    isBetaUser: false,
  })),
}));

vi.mock("@/lib/feature-flags/access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/feature-flags/access")>(
    "@/lib/feature-flags/access",
  );
  return actual;
});

import { resetProbeSideEffectCounters } from "@/lib/health/probe-side-effects";

describe("feature-flags availability GET is read-only", () => {
  beforeEach(() => {
    persistNotificationsNow.mockClear();
    createUserNotification.mockClear();
    resetProbeSideEffectCounters();
  });

  it("does not persist or insert notifications", async () => {
    const { GET } = await import("@/app/api/feature-flags/availability/route");
    const writes = [];
    for (let i = 0; i < 10; i += 1) {
      const response = await GET();
      expect(response.status).toBe(200);
      const body = (await response.json()) as { flags: Record<string, boolean> };
      expect(body.flags).toBeTruthy();
      writes.push({
        persist: persistNotificationsNow.mock.calls.length,
        create: createUserNotification.mock.calls.length,
      });
    }
    expect(persistNotificationsNow).not.toHaveBeenCalled();
    expect(createUserNotification).not.toHaveBeenCalled();
    expect(writes.every((row) => row.persist === 0 && row.create === 0)).toBe(
      true,
    );
  });
});
