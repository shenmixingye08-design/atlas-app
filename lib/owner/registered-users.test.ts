import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getCount: async () => 1000,
    },
  }),
}));

import { fetchRegisteredUserCount } from "./registered-users";

describe("fetchRegisteredUserCount", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses Clerk getCount as the registered-user source of truth", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_owner");
    const result = await fetchRegisteredUserCount();
    expect(result.availability).toBe("ok");
    expect(result.total).toBe(1000);
    expect(result.source).toBe("clerk");
  });

  it("does not invent 0 when Clerk is disconnected", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const result = await fetchRegisteredUserCount();
    expect(result.availability).toBe("disconnected");
    expect(result.total).toBeNull();
  });
});
