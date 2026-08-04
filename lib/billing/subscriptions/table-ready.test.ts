import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    from: fromMock,
  }),
}));

describe("isBillingDedicatedTableReady", () => {
  beforeEach(() => {
    fromMock.mockReset();
    vi.resetModules();
  });

  it("returns false on schema cache miss without throwing", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: null,
            error: {
              message:
                "Could not find the table 'public.atlas_billing_subscriptions' in the schema cache",
            },
          }),
        }),
      }),
    });

    const { isBillingDedicatedTableReady, resetBillingDedicatedTableReadyCache } =
      await import("./table-ready");
    resetBillingDedicatedTableReadyCache();
    await expect(isBillingDedicatedTableReady()).resolves.toBe(false);
    // Cached
    await expect(isBillingDedicatedTableReady()).resolves.toBe(false);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("returns true when select succeeds", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    });

    const { isBillingDedicatedTableReady, resetBillingDedicatedTableReadyCache } =
      await import("./table-ready");
    resetBillingDedicatedTableReadyCache();
    await expect(isBillingDedicatedTableReady()).resolves.toBe(true);
  });
});
