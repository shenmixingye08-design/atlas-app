import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));

const ensureAutomationsV2Hydrated = vi.fn(async (_userId: string) => undefined);
const ensureAutomationRunsV2Hydrated = vi.fn(async (_userId: string) => undefined);
const listAutomationOwnerUserIds = vi.fn(async () => ["user_hydrate_1"]);

vi.mock("@/lib/automation-platform/durable", () => ({
  ensureAutomationsV2Hydrated: (userId: string) =>
    ensureAutomationsV2Hydrated(userId),
  persistAutomationV2Now: vi.fn((row: unknown) => row),
}));
vi.mock("@/lib/automation-platform/durable-runs", () => ({
  ensureAutomationRunsV2Hydrated: (userId: string) =>
    ensureAutomationRunsV2Hydrated(userId),
}));
vi.mock("@/lib/automations/global-durable", () => ({
  listAutomationOwnerUserIds: () => listAutomationOwnerUserIds(),
}));
vi.mock("@/lib/automation-platform/repository/memory-store", () => ({
  memoryListDueActiveAutomations: vi.fn(() => []),
}));
vi.mock("@/lib/automation-platform/service/automation-service", () => ({
  automationPlatformService: {
    enqueueRun: vi.fn(),
  },
}));
vi.mock("@/lib/feature-flags/access", () => ({
  buildFeatureAccessContext: () => ({ email: null, isOwner: false }),
  isFeatureEnabled: () => true,
}));

import { processDueScheduledAutomationsV2 } from "./due-tick";

describe("processDueScheduledAutomationsV2 hydration", () => {
  beforeEach(() => {
    ensureAutomationsV2Hydrated.mockClear();
    ensureAutomationRunsV2Hydrated.mockClear();
    listAutomationOwnerUserIds.mockClear();
  });

  it("hydrates owner user ids before due scan (cold-start safe)", async () => {
    const result = await processDueScheduledAutomationsV2({
      dispatch: false,
      limit: 5,
    });
    expect(listAutomationOwnerUserIds).toHaveBeenCalledOnce();
    expect(ensureAutomationsV2Hydrated).toHaveBeenCalledWith("user_hydrate_1");
    expect(ensureAutomationRunsV2Hydrated).toHaveBeenCalledWith(
      "user_hydrate_1",
    );
    expect(result.due).toBe(0);
  });
});
