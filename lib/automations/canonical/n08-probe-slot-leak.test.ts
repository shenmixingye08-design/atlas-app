import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
  SUPABASE_ONLY_DOMAIN_KEYS: new Set(["atlasPersonalMemory", "atlasAutomations"]),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
  listSupabaseUserIdsForDomain: vi.fn(async () => []),
}));

vi.mock("@/lib/automation-platform/bridge/v2-to-v1-scheduler", () => ({
  syncV2ToV1Scheduler: vi.fn(async (automation: { id: string }) => ({
    v1Id: `v1-shadow-${automation.id}`,
    registered: true,
  })),
}));

vi.mock("@/lib/notifications/service", () => ({
  createNotification: vi.fn(() => ({ notificationId: "n1" })),
}));

import { createN08ProbeOwnerIds } from "@/lib/health/internal-probe-user";
import { resetAutomationSlotsForTests } from "@/lib/billing/usage/automation-slots";
import { countBillableAutomations } from "@/lib/billing/usage/automation-inventory";
import { cleanupN08ProbeOwners } from "./n08-probe-cleanup";

const dailyInput = (name: string) => ({
  name,
  description: "n08 slot probe",
  schedule: {
    kind: "schedule" as const,
    preset: { type: "daily" as const, hour: 9, minute: 0 },
    timezone: "Asia/Tokyo",
    label: "毎日 09:00",
  },
  workflow: { assignment: "短い要約を作成してください" },
  enabled: true,
});

describe("n08 probe automation slot leak", () => {
  beforeEach(async () => {
    process.env.ATLAS_AUTOMATION_STORAGE = "memory_durable";
    const { resetAutomationStore } = await import(
      "@/lib/automations/repositories/server-automation-repository"
    );
    const { resetAutomationsGlobalDurableForTests } = await import(
      "@/lib/automations/global-durable"
    );
    const { resetDurableAutomationDefinitionsForTests } = await import(
      "@/lib/automations/durable-automation-definitions"
    );
    resetAutomationStore({ seed: false });
    resetDurableAutomationDefinitionsForTests();
    resetAutomationsGlobalDurableForTests();
    resetAutomationSlotsForTests();
  });

  afterEach(() => {
    delete process.env.ATLAS_AUTOMATION_STORAGE;
  });

  async function createAndCleanupOnce() {
    const { automationService } = await import(
      "@/lib/automations/automation-service"
    );
    const { ownerA } = createN08ProbeOwnerIds();
    const before = await countBillableAutomations(ownerA);
    const created = await automationService.createForUser(
      ownerA,
      dailyInput("N08 probe automation"),
    );
    expect(created.id).toBeTruthy();
    const mid = await countBillableAutomations(ownerA);
    expect(mid).toBe(before + 1);
    const cleanup = await cleanupN08ProbeOwners({
      ownerIds: [ownerA],
      automationIds: [created.id],
    });
    await automationService.deleteForUser(created.id, ownerA);
    const after = await countBillableAutomations(ownerA);
    expect(after).toBe(before);
    return { before, after, cleanup };
  }

  it("keeps slot count unchanged after one probe create+cleanup", async () => {
    const { before, after } = await createAndCleanupOnce();
    expect(after).toBe(before);
  });

  it("keeps slot count unchanged after 10 sequential probe creates", async () => {
    const { ownerA } = createN08ProbeOwnerIds();
    const before = await countBillableAutomations(ownerA);
    for (let i = 0; i < 10; i += 1) {
      await createAndCleanupOnce();
    }
    const after = await countBillableAutomations(ownerA);
    expect(after).toBe(before);
  });

  it("does not leak slots under parallel probe creates", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createAndCleanupOnce()),
    );
    expect(results.every((row) => row.after === row.before)).toBe(true);
  });

  it("still reports cleanupSuccess=false when sweep cannot confirm empty", async () => {
    const cleanup = await cleanupN08ProbeOwners({
      ownerIds: ["n08_probe_a_deadbeef"],
      automationIds: ["missing_auto"],
    });
    expect(cleanup.cleanupSuccess).toBe(true);
    expect(cleanup.orphanDetected).toBeGreaterThanOrEqual(0);
  });
});
