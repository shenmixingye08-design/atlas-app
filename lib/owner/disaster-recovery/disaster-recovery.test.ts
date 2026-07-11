import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
  listSupabaseUserIdsForDomain: vi.fn(async () => []),
}));

vi.mock("@/lib/automations/global-durable", () => ({
  AUTOMATIONS_DOMAIN_KEY: "atlasAutomations",
  listAutomationOwnerUserIds: vi.fn(async () => []),
}));

vi.mock("@/lib/notifications/emitters", () => ({
  notifyOwnerSystemIncident: vi.fn(),
  notifyOwnerExternalApiError: vi.fn(),
}));

describe("disaster recovery", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_clerk");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_clerk");
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test");
    vi.stubEnv("CRON_SECRET", "cron");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec");
    vi.stubEnv("STRIPE_PRICE_LIGHT", "price_l");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_s");
    vi.stubEnv("STRIPE_PRICE_PREMIUM", "price_p");

    const { resetDisasterRecoveryStoreForTests } = await import("./store");
    const { resetDisasterRecoveryDurableForTests } = await import("./durable");
    const { resetMonitoringStoreForTests } = await import(
      "@/lib/owner/monitoring/store"
    );
    const { resetErrorMonitoringStore } = await import(
      "@/lib/owner/error-monitoring/store"
    );
    const { resetSystemStatusStore } = await import(
      "@/lib/owner/system-status/store"
    );
    const { resetMaintenanceModeConfig } = await import(
      "@/lib/owner/system-status/maintenance"
    );
    const { resetAuditLogStoreForTests } = await import(
      "@/lib/owner/audit-log/store"
    );
    const { resetAuditLogDurableForTests } = await import(
      "@/lib/owner/audit-log/durable"
    );

    resetDisasterRecoveryStoreForTests();
    resetDisasterRecoveryDurableForTests();
    resetMonitoringStoreForTests();
    resetErrorMonitoringStore();
    resetSystemStatusStore();
    resetMaintenanceModeConfig();
    resetAuditLogStoreForTests();
    resetAuditLogDurableForTests();
  });

  it("queues and retries on OpenAI / Stripe / Cron / Commander / Automation stop", async () => {
    const { recordMonitoringIncident } = await import(
      "@/lib/owner/monitoring/incidents"
    );
    const { listDrQueueJobs, listDrFallbacks, getDrTotalRetries } =
      await import("./store");
    const { processDisasterQueue } = await import("./queue");

    for (const [kind, targetId] of [
      ["openai_failure", "openai"],
      ["stripe_failure", "stripe"],
      ["cron_stopped", "cron"],
      ["commander_failure", "commander"],
      ["automation_failure", "automation"],
    ] as const) {
      recordMonitoringIncident({
        kind,
        targetId,
        message: `${targetId} stopped`,
        critical: false,
      });
    }

    // Supabase stop via explicit incident
    recordMonitoringIncident({
      kind: "supabase_failure",
      targetId: "supabase",
      message: "Supabase stopped",
      critical: false,
    });

    expect(listDrQueueJobs().length).toBeGreaterThanOrEqual(6);
    expect(listDrFallbacks().some((f) => f.targetId === "openai")).toBe(true);

    // Force retries to succeed (advance past backoff)
    processDisasterQueue({
      now: new Date(Date.now() + 120_000),
      probe: () => true,
    });
    expect(getDrTotalRetries()).toBeGreaterThan(0);
    expect(listDrQueueJobs().some((j) => j.status === "succeeded")).toBe(true);
  });

  it("moves exhausted retries to fallback / dead", async () => {
    const { enqueueDisasterJob, processDisasterQueue } = await import(
      "./queue"
    );
    const { listDrQueueJobs } = await import("./store");
    const { activateFallback } = await import("./fallback");

    const job = enqueueDisasterJob({
      kind: "openai",
      targetId: "openai",
      message: "fail forever",
    });

    for (let i = 0; i < 5; i += 1) {
      processDisasterQueue({
        now: new Date(Date.now() + i * 120_000),
        probe: () => false,
      });
    }

    const dead = listDrQueueJobs().find((row) => row.id === job.id);
    expect(dead?.status).toBe("dead");
    activateFallback({
      targetId: "openai",
      mode: "offline",
      reason: "retries exhausted",
    });
    const { listDrFallbacks } = await import("./store");
    expect(
      listDrFallbacks().find((f) => f.targetId === "openai")?.mode,
    ).toBe("offline");
  });

  it("creates backup covering required sections", async () => {
    const { createDisasterBackup } = await import("./backup");
    const { enqueueDisasterJob } = await import("./queue");
    const { activateFallback } = await import("./fallback");

    enqueueDisasterJob({
      kind: "cron",
      targetId: "cron",
      message: "cron down",
    });
    activateFallback({
      targetId: "cron",
      mode: "degraded",
      reason: "cron down",
    });

    const backup = await createDisasterBackup({ label: "test-backup" });
    expect(backup.sections).toEqual(
      expect.arrayContaining([
        "projects",
        "automation",
        "learning",
        "workMemory",
        "notifications",
        "billing",
        "settings",
      ]),
    );
    expect(backup.domainKeys).toEqual(
      expect.arrayContaining(["atlasAutomations", "atlasWorkMemory"]),
    );
  });

  it("restore works when backup remains in store", async () => {
    const { createDisasterBackup, restoreDisasterBackup } = await import(
      "./backup"
    );
    const { enqueueDisasterJob } = await import("./queue");
    const { activateFallback } = await import("./fallback");
    const { listDrQueueJobs, listDrFallbacks } = await import("./store");

    enqueueDisasterJob({
      kind: "automation",
      targetId: "automation",
      message: "auto down",
    });
    activateFallback({
      targetId: "automation",
      mode: "degraded",
      reason: "auto down",
    });
    const backup = await createDisasterBackup();

    // clear operational state but keep backups array by replacing only queue/fallbacks
    const { replaceDrState } = await import("./store");
    replaceDrState({ queue: [], fallbacks: [] });
    expect(listDrQueueJobs()).toHaveLength(0);

    restoreDisasterBackup(backup.id);
    expect(listDrQueueJobs().length).toBeGreaterThan(0);
    expect(listDrFallbacks().length).toBeGreaterThan(0);
  });

  it("exports incident and recovery CSV", async () => {
    const { recordMonitoringIncident } = await import(
      "@/lib/owner/monitoring/incidents"
    );
    recordMonitoringIncident({
      kind: "openai_failure",
      targetId: "openai",
      message: "OpenAI stopped",
      critical: false,
    });

    const { getDisasterRecoverySnapshot } = await import("./service");
    const {
      disasterIncidentsToCsv,
      disasterRecoveryHistoryToCsv,
      disasterRecoverySnapshotToCsv,
    } = await import("./csv");

    const snapshot = await getDisasterRecoverySnapshot();
    expect(disasterIncidentsToCsv()).toContain("openai_failure");
    expect(disasterRecoveryHistoryToCsv(snapshot.recoveryHistory)).toContain(
      "enqueue",
    );
    expect(disasterRecoverySnapshotToCsv(snapshot)).toContain("# recovery");
  });

  it("builds owner snapshot with recovery metrics", async () => {
    const { recordMonitoringIncident } = await import(
      "@/lib/owner/monitoring/incidents"
    );
    recordMonitoringIncident({
      kind: "commander_failure",
      targetId: "commander",
      message: "Commander stopped",
      critical: false,
    });
    const { createDisasterBackup } = await import("./backup");
    await createDisasterBackup();

    const { getDisasterRecoverySnapshot } = await import("./service");
    const snapshot = await getDisasterRecoverySnapshot();
    expect(snapshot.openIncidents.length).toBeGreaterThan(0);
    expect(snapshot.recovery.queuedJobs + snapshot.recovery.retryingJobs).toBeGreaterThan(
      0,
    );
    expect(snapshot.lastBackup).not.toBeNull();
  });
});
