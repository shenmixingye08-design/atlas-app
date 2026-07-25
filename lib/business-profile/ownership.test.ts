import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: vi.fn(() => null),
}));

import {
  createProfile,
  getProfileForUser,
  listProfiles,
  softDeleteProfile,
  updateProfile,
} from "./service";
import { resetBusinessProfileRepositoryForTests } from "./store";

beforeEach(() => {
  resetBusinessProfileRepositoryForTests();
});

describe("business profile ownership", () => {
  it("does not allow user B to read, update, or delete user A profile", async () => {
    const profile = await createProfile("user_a", {
      companyName: "株式会社A",
      isDefault: true,
    });

    expect(await getProfileForUser("user_b", profile.id)).toBeNull();
    expect(
      await updateProfile("user_b", profile.id, { companyName: "株式会社B" }),
    ).toBeNull();
    expect(await softDeleteProfile("user_b", profile.id)).toBe(false);
    expect(await listProfiles("user_b")).toEqual([]);

    const ownerProfile = await getProfileForUser("user_a", profile.id);
    expect(ownerProfile?.companyName).toBe("株式会社A");
  });

  it("masks bank account numbers in list APIs", async () => {
    await createProfile("user_a", {
      companyName: "株式会社A",
      bankAccountNumber: "1234567",
    });

    const [profile] = await listProfiles("user_a");
    expect(profile?.bankAccountNumberMasked).toBe("••••4567");
    expect(JSON.stringify(profile)).not.toContain("1234567");
  });
});
