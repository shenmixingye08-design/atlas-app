import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => null,
}));

vi.mock("./automation-inventory", () => ({
  countBillableAutomations: vi.fn(async (userId: string) =>
    userId.startsWith("user_real") ? 1 : 0,
  ),
  listBillableAutomationIds: vi.fn(async (userId: string) =>
    userId.startsWith("user_real") ? ["auto_real_1"] : [],
  ),
}));

import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { createN08ProbeOwnerIds } from "@/lib/health/internal-probe-user";
import { applySubscriptionFromStripe } from "@/lib/billing/subscriptions/service";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";

import { assertAutomationCreateAllowed } from "./automation-guard";
import { resetAutomationSlotsForTests } from "./automation-slots";

describe("automation slot guard for internal probes", () => {
  beforeEach(() => {
    resetSubscriptionStore();
    resetAutomationSlotsForTests();
  });

  it("does not consume or deny plan quota for probe identities", async () => {
    const { ownerA } = createN08ProbeOwnerIds();
    await expect(
      assertAutomationCreateAllowed({
        userId: ownerA,
        automationId: "auto_probe_1",
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertAutomationCreateAllowed({
        userId: ownerA,
        automationId: "auto_probe_2",
      }),
    ).resolves.toBeUndefined();
  });

  it("still enforces Free plan slot limit for real users", async () => {
    await applySubscriptionFromStripe({
      userId: "user_real_customer_slot",
      stripeCustomerId: "cus_real_slot",
      stripeSubscriptionId: "sub_real_slot",
      planId: "free",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    await expect(
      assertAutomationCreateAllowed({
        userId: "user_real_customer_slot",
        automationId: "auto_real_2",
      }),
    ).rejects.toBeInstanceOf(AutomationPlatformError);
  });
});
