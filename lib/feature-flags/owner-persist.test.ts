import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const persistNow = vi.fn();
const ensureHydrated = vi.fn();
const hydrateFailed = vi.fn();

vi.mock("./durable", () => ({
  persistFeatureFlagsNow: () => persistNow(),
  ensureFeatureFlagsHydrated: () => ensureHydrated(),
  didFeatureFlagHydrateFail: () => hydrateFailed(),
}));

import { resetFeatureFlagStore } from "./store";
import { updateFeatureFlagStateForOwner } from "./service";

describe("updateFeatureFlagStateForOwner", () => {
  beforeEach(() => {
    resetFeatureFlagStore();
    persistNow.mockReset();
    ensureHydrated.mockReset();
    hydrateFailed.mockReset();
    ensureHydrated.mockResolvedValue(true);
    hydrateFailed.mockReturnValue(false);
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks production updates when durable store is missing", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const result = await updateFeatureFlagStateForOwner("google", "off");
    expect(result).toMatchObject({ status: 503 });
    expect("error" in result && result.error).toMatch(/利用できません/);
  });

  it("keeps the previous state when durable persist fails", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    persistNow.mockResolvedValue(false);

    const result = await updateFeatureFlagStateForOwner("google", "off");
    expect(result).toMatchObject({ status: 503 });

    const { getFeatureFlagState } = await import("./store");
    expect(getFeatureFlagState("google")).toBe("on");
  });

  it("persists and returns the new state when durable save succeeds", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    persistNow.mockResolvedValue(true);

    const result = await updateFeatureFlagStateForOwner("google", "off");
    expect("snapshot" in result).toBe(true);
    if ("snapshot" in result) {
      expect(result.snapshot.flags.find((row) => row.id === "google")?.state).toBe(
        "off",
      );
      expect(result.snapshot.persistMode).toBe("durable");
      expect(result.snapshot.mutable).toBe(true);
    }
    expect(persistNow).toHaveBeenCalledOnce();
  });
});
