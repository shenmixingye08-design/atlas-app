import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("./quota-engine", () => ({
  loadDurableAiRuns: vi.fn(),
}));

vi.mock("./automation-inventory", () => ({
  countBillableAutomations: vi.fn(),
}));

import { countBillableAutomations } from "./automation-inventory";
import { hydrateUserUsageMeters } from "./hydrate";
import { loadDurableAiRuns } from "./quota-engine";
import { resetUsageStore } from "./store";

describe("hydrateUserUsageMeters fail-closed", () => {
  beforeEach(() => {
    resetUsageStore();
    vi.mocked(loadDurableAiRuns).mockReset();
    vi.mocked(countBillableAutomations).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is ready only when AI runs and automation inventory both succeed", async () => {
    vi.mocked(loadDurableAiRuns).mockResolvedValue({ used: 4, ready: true });
    vi.mocked(countBillableAutomations).mockResolvedValue(2);
    const result = await hydrateUserUsageMeters("user_ok");
    expect(result).toEqual({ ready: true, error: null });
  });

  it("does not become ready when usage counters fail", async () => {
    vi.mocked(loadDurableAiRuns).mockResolvedValue({ used: 0, ready: false });
    vi.mocked(countBillableAutomations).mockResolvedValue(2);
    const result = await hydrateUserUsageMeters("user_usage_down");
    expect(result.ready).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("does not become ready when automation inventory throws", async () => {
    vi.mocked(loadDurableAiRuns).mockResolvedValue({ used: 4, ready: true });
    vi.mocked(countBillableAutomations).mockRejectedValue(
      new Error("automation store down"),
    );
    const result = await hydrateUserUsageMeters("user_auto_down");
    expect(result.ready).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
