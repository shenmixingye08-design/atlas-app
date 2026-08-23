import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("./durable-counters", () => ({
  loadDurableUsageCounters: vi.fn(),
}));

vi.mock("./reconcile", () => ({
  reconcileCurrentMonthUsageFromEvidence: vi.fn(async () => ({ ready: true })),
}));

vi.mock("./automation-inventory", () => ({
  countBillableAutomations: vi.fn(),
}));

import { countBillableAutomations } from "./automation-inventory";
import { loadDurableUsageCounters } from "./durable-counters";
import { hydrateUserUsageMeters, resetUsageHydrateInflightForTests } from "./hydrate";
import { resetUsageStore } from "./store";

describe("hydrateUserUsageMeters fail-closed", () => {
  beforeEach(() => {
    resetUsageStore();
    resetUsageHydrateInflightForTests();
    vi.mocked(loadDurableUsageCounters).mockReset();
    vi.mocked(countBillableAutomations).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is ready only when usage counters and automation inventory both succeed", async () => {
    vi.mocked(loadDurableUsageCounters).mockResolvedValue({
      counters: {
        aiRuns: 4,
        snsPosts: 0,
        xUrlPosts: 0,
        wordpressPosts: 0,
      },
      ready: true,
      error: null,
    });
    vi.mocked(countBillableAutomations).mockResolvedValue(2);
    const result = await hydrateUserUsageMeters("user_ok");
    expect(result).toEqual({ ready: true, error: null });
  });

  it("does not become ready when usage counters fail", async () => {
    vi.mocked(loadDurableUsageCounters).mockResolvedValue({
      counters: {
        aiRuns: 0,
        snsPosts: 0,
        xUrlPosts: 0,
        wordpressPosts: 0,
      },
      ready: false,
      error: "usage_unavailable",
    });
    vi.mocked(countBillableAutomations).mockResolvedValue(2);
    const result = await hydrateUserUsageMeters("user_usage_down");
    expect(result.ready).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("does not become ready when automation inventory throws", async () => {
    vi.mocked(loadDurableUsageCounters).mockResolvedValue({
      counters: {
        aiRuns: 4,
        snsPosts: 0,
        xUrlPosts: 0,
        wordpressPosts: 0,
      },
      ready: true,
      error: null,
    });
    vi.mocked(countBillableAutomations).mockRejectedValue(
      new Error("automation store down"),
    );
    const result = await hydrateUserUsageMeters("user_auto_down");
    expect(result.ready).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
