import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => `${userId}@example.com`),
}));

vi.mock("@/lib/billing/stripe/client", () => ({
  getStripeClient: vi.fn(() => null),
}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
  listSupabaseUserIdsForDomain: vi.fn(async () => []),
  deleteSupabaseUserDomains: vi.fn(async () => true),
}));

vi.mock("@/lib/persistence/clerk-private-metadata", () => ({
  clearClerkPrivateMetadataKeys: vi.fn(async () => true),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      deleteUser: vi.fn(async () => undefined),
      getUser: vi.fn(async () => ({ privateMetadata: {} })),
      updateUserMetadata: vi.fn(async () => undefined),
    },
  })),
}));

vi.mock("@/lib/integrations/external-services/service", () => ({
  externalServiceManager: {
    disconnect: vi.fn(async () => ({ status: "disconnected" })),
  },
}));

vi.mock("@/lib/integrations/line/service", () => ({
  disconnectLineForUser: vi.fn(async () => true),
}));

vi.mock("@/lib/automations/automation-service", () => ({
  automationService: {
    listForUser: vi.fn(async () => [
      { id: "auto_1", enabled: true, userId: "user_x" },
    ]),
    setEnabledForUser: vi.fn(async () => ({ id: "auto_1", enabled: false })),
  },
}));

vi.mock("@/lib/automations/durable", () => ({
  schedulePersistAutomations: vi.fn(),
}));

vi.mock("@/lib/automations/global-durable", () => ({
  unregisterAutomationUserIdIfEmpty: vi.fn(async () => undefined),
}));

vi.mock("@/lib/automations/repositories/server-automation-repository", () => ({
  serverAutomationRepository: {
    replaceUserAutomations: vi.fn(async () => undefined),
  },
}));

vi.mock("@/lib/work-memory/service", () => ({
  resetWorkMemories: vi.fn(() => 0),
}));

vi.mock("@/lib/learning-engine/service", () => ({
  resetLearningStores: vi.fn(),
}));

vi.mock("@/lib/user-memory/service", () => ({
  resetUserMemories: vi.fn(() => 0),
}));

vi.mock("@/lib/commander/run-store", () => ({
  clearCommanderRunsForUser: vi.fn(() => 0),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: vi.fn(() => null),
}));

describe("account deletion flow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    const { resetAccountDeletionStore } = await import("./store");
    const { resetAccountDeletionDurableForTests } = await import("./durable");
    resetSubscriptionStore();
    resetAccountDeletionStore();
    resetAccountDeletionDurableForTests();
  });

  it("handles free withdrawal: stops automations/notifications and schedules 30-day purge", async () => {
    const { requestAccountWithdrawal } = await import("./service");
    const { isAutomationSuspendedForUser } = await import(
      "@/lib/billing/subscriptions/lifecycle"
    );
    const { getUserNotificationPreferences } = await import(
      "@/lib/notifications/service"
    );
    const { automationService } = await import(
      "@/lib/automations/automation-service"
    );

    const record = await requestAccountWithdrawal("user_free");
    expect(record.status).toBe("scheduled");
    expect(record.wasPaid).toBe(false);
    expect(record.steps.automationsStopped).toBe(true);
    expect(record.steps.notificationsStopped).toBe(true);
    expect(record.steps.integrationsDisconnected).toBe(true);
    expect(record.steps.stripeCanceled).toBe(true);
    expect(isAutomationSuspendedForUser("user_free")).toBe(true);
    expect(getUserNotificationPreferences("user_free").allEnabled).toBe(false);
    expect(automationService.setEnabledForUser).toHaveBeenCalledWith(
      "auto_1",
      "user_free",
      false,
    );

    const deleteAt = new Date(record.deleteAfter).getTime();
    const requested = new Date(record.requestedAt).getTime();
    expect(deleteAt - requested).toBeGreaterThanOrEqual(29 * 24 * 60 * 60 * 1000);
  });

  it("handles paid withdrawal with cancel_at_period_end", async () => {
    const { applySubscriptionFromStripe } = await import(
      "@/lib/billing/subscriptions/service"
    );
    const { requestAccountWithdrawal } = await import("./service");
    const { resolveUserSubscription } = await import(
      "@/lib/billing/subscriptions/service"
    );

    applySubscriptionFromStripe({
      userId: "user_paid",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      planId: "standard",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const record = await requestAccountWithdrawal("user_paid");
    expect(record.wasPaid).toBe(true);
    expect(record.planId).toBe("standard");
    expect(resolveUserSubscription("user_paid").cancelAtPeriodEnd).toBe(true);
  });

  it("cancels scheduled deletion (restore)", async () => {
    const { requestAccountWithdrawal, cancelAccountDeletion } = await import(
      "./service"
    );
    await requestAccountWithdrawal("user_cancel");
    const canceled = await cancelAccountDeletion("user_cancel");
    expect(canceled?.status).toBe("canceled");
    expect(canceled?.canceledAt).toBeTruthy();
  });

  it("requires DELETE confirmation for purge", async () => {
    const { requestAccountWithdrawal, purgeAccount } = await import("./service");
    await requestAccountWithdrawal("user_purge");
    await expect(purgeAccount("user_purge", "delete")).rejects.toThrow(/DELETE/);
  });

  it("purges with DELETE after withdrawal", async () => {
    const { requestAccountWithdrawal, purgeAccount } = await import("./service");
    const { resetWorkMemories } = await import("@/lib/work-memory/service");
    const { clearClerkPrivateMetadataKeys } = await import(
      "@/lib/persistence/clerk-private-metadata"
    );

    await requestAccountWithdrawal("user_hard");
    const purged = await purgeAccount("user_hard", "DELETE");
    expect(purged.status).toBe("purged");
    expect(resetWorkMemories).toHaveBeenCalledWith("user_hard");
    expect(clearClerkPrivateMetadataKeys).toHaveBeenCalled();
  });

  it("lists scheduled deletions for owner with restore deadline", async () => {
    const { requestAccountWithdrawal, listOwnerAccountDeletions } = await import(
      "./service"
    );
    await requestAccountWithdrawal("user_owner_list");
    const rows = await listOwnerAccountDeletions();
    expect(rows.some((row) => row.userId === "user_owner_list")).toBe(true);
    const row = rows.find((entry) => entry.userId === "user_owner_list");
    expect(row?.restoreDeadline).toBe(row?.deleteAfter);
    expect(row?.daysRemaining).toBeGreaterThan(0);
  });
});
