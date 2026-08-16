import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const persistNow = vi.fn();
const ensureHydrated = vi.fn();
const hydrateFailed = vi.fn();

vi.mock("./maintenance-durable", () => ({
  persistMaintenanceNow: () => persistNow(),
  ensureMaintenanceHydrated: () => ensureHydrated(),
  didMaintenanceHydrateFail: () => hydrateFailed(),
}));

import { resetMaintenanceModeConfig } from "./maintenance";
import { updateMaintenanceModeForOwner } from "./maintenance-service";

describe("updateMaintenanceModeForOwner", () => {
  beforeEach(() => {
    resetMaintenanceModeConfig();
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

  it("blocks production maintenance toggles without a durable store", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const result = await updateMaintenanceModeForOwner({ enabled: true });
    expect(result).toMatchObject({ status: 503 });
  });

  it("reverts memory when durable persist fails", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    persistNow.mockResolvedValue(false);

    const result = await updateMaintenanceModeForOwner({ enabled: true });
    expect(result).toMatchObject({ status: 503 });

    const { getMaintenanceModeConfig } = await import("./maintenance");
    expect(getMaintenanceModeConfig().enabled).toBe(false);
  });

  it("keeps maintenance enabled after a successful durable save", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    persistNow.mockResolvedValue(true);

    const result = await updateMaintenanceModeForOwner({ enabled: true });
    expect("config" in result).toBe(true);
    if ("config" in result) {
      expect(result.config.enabled).toBe(true);
      expect(result.config.persistMode).toBe("durable");
    }
  });
});
