import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const updateUserMetadata = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: { getUser, updateUserMetadata },
  }),
}));

import { createN08ProbeOwnerIds } from "@/lib/health/internal-probe-user";

describe("Clerk remote ops skip internal health probe users", () => {
  beforeEach(() => {
    getUser.mockReset();
    updateUserMetadata.mockReset();
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_probe_skip");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not call Clerk get/update for generated n08 probe owners", async () => {
    const { loadClerkPrivateMetadataKey, persistClerkPrivateMetadataKey, clearClerkPrivateMetadataKeys } =
      await import("./clerk-private-metadata");
    const { ownerA } = createN08ProbeOwnerIds();
    await expect(loadClerkPrivateMetadataKey(ownerA, "atlasAutomations")).resolves.toBeNull();
    await expect(
      persistClerkPrivateMetadataKey(ownerA, "atlasAutomations", { ok: true }),
    ).resolves.toBe(false);
    await expect(
      clearClerkPrivateMetadataKeys(ownerA, ["atlasAutomations"]),
    ).resolves.toBe(false);
    expect(getUser).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });
});
