import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
}));

vi.mock("@/lib/notifications/emitters", () => ({
  notifyOwnerSystemIncident: vi.fn(),
  notifyOwnerExternalApiError: vi.fn(),
}));

describe("owner monitoring dashboard", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_clerk");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_clerk");
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec");
    vi.stubEnv("STRIPE_PRICE_LIGHT", "price_l");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_s");
    vi.stubEnv("STRIPE_PRICE_PREMIUM", "price_p");

    const { resetMonitoringStoreForTests } = await import("./store");
    const { resetAuditLogStoreForTests } = await import(
      "@/lib/owner/audit-log/store"
    );
    const { resetAuditLogDurableForTests } = await import(
      "@/lib/owner/audit-log/durable"
    );
    const { resetErrorMonitoringStore } = await import(
      "@/lib/owner/error-monitoring/store"
    );
    const { resetSystemStatusStore } = await import(
      "@/lib/owner/system-status/store"
    );
    resetMonitoringStoreForTests();
    resetAuditLogStoreForTests();
    resetAuditLogDurableForTests();
    resetErrorMonitoringStore();
    resetSystemStatusStore();
  });

  it("marks OpenAI as down when unresolved errors exist", async () => {
    const { recordOpenAiFailure } = await import(
      "@/lib/owner/error-monitoring/telemetry"
    );
    recordOpenAiFailure("OpenAI stopped", "test");

    const { buildMonitorHealth } = await import("./health");
    const health = buildMonitorHealth();
    const openai = health.find((row) => row.id === "openai");
    expect(openai?.level).toBe("down");
  });

  it("marks Stripe as down when Stripe failures are open", async () => {
    const { recordStripeFailure } = await import(
      "@/lib/owner/error-monitoring/telemetry"
    );
    recordStripeFailure("Stripe stopped", "test");

    const { buildMonitorHealth } = await import("./health");
    const stripe = buildMonitorHealth().find((row) => row.id === "stripe");
    expect(stripe?.level).toBe("down");
  });

  it("marks Cron as down after tick failure", async () => {
    const { recordCronTickOutcome } = await import("./incidents");
    recordCronTickOutcome(false, "Cron stopped");

    const { buildMonitorHealth } = await import("./health");
    const cron = buildMonitorHealth().find((row) => row.id === "cron");
    expect(cron?.level).toBe("down");
    expect(cron?.detail).toContain("Cron");
  });

  it("records automation and commander failures into incidents + audit", async () => {
    const { recordMonitoringIncident } = await import("./incidents");
    const { listMonitoringIncidents } = await import("./store");
    const { listAuditLogEntries } = await import("@/lib/owner/audit-log/store");

    recordMonitoringIncident({
      kind: "automation_failure",
      targetId: "automation",
      message: "Automation failed",
      critical: false,
    });
    recordMonitoringIncident({
      kind: "commander_failure",
      targetId: "commander",
      message: "Commander failed",
      critical: false,
    });

    expect(
      listMonitoringIncidents().some((i) => i.kind === "automation_failure"),
    ).toBe(true);
    expect(
      listMonitoringIncidents().some((i) => i.kind === "commander_failure"),
    ).toBe(true);
    expect(
      listAuditLogEntries().some((a) => a.action === "automation_failure"),
    ).toBe(true);
    expect(
      listAuditLogEntries().some((a) => a.action === "commander_failure"),
    ).toBe(true);
  });

  it("builds analytics KPIs and series", async () => {
    const { recordAuditLog } = await import("@/lib/owner/audit-log/record");
    await recordAuditLog({
      userId: "u1",
      category: "commander",
      action: "commander_run",
      result: "success",
    });
    await recordAuditLog({
      userId: "u1",
      category: "automation",
      action: "automation_run",
      result: "success",
    });
    await recordAuditLog({
      userId: "u2",
      category: "request",
      action: "request_create",
      result: "failure",
      reason: "boom",
    });

    const { buildAnalyticsKpis, buildAnalyticsSeries } = await import(
      "./analytics"
    );
    const today = buildAnalyticsKpis("today");
    expect(today.commanderRuns).toBeGreaterThanOrEqual(1);
    expect(today.automationRuns).toBeGreaterThanOrEqual(1);
    expect(today.aiRuns).toBeGreaterThanOrEqual(1);
    expect(today.apiErrorRatePercent).toBeGreaterThan(0);

    const series = buildAnalyticsSeries();
    expect(series.daily.length).toBe(7);
    expect(series.weekly.length).toBe(4);
    expect(series.monthly.length).toBe(6);
  });

  it("exports analytics / incidents / health CSV", async () => {
    const { recordMonitoringIncident } = await import("./incidents");
    recordMonitoringIncident({
      kind: "openai_failure",
      targetId: "openai",
      message: "down",
      critical: false,
    });

    const { getMonitoringSnapshot } = await import("./service");
    const {
      analyticsKpisToCsv,
      healthToCsv,
      incidentsToCsv,
      monitoringSnapshotToCsvBundle,
    } = await import("./csv");

    const snapshot = await getMonitoringSnapshot();
    const analyticsCsv = analyticsKpisToCsv([
      snapshot.analytics.today,
      snapshot.analytics.week,
      snapshot.analytics.month,
    ]);
    expect(analyticsCsv).toContain("activeUsers");
    expect(healthToCsv(snapshot.health)).toContain("openai");
    expect(incidentsToCsv(snapshot.incidents)).toContain("openai_failure");
    expect(monitoringSnapshotToCsvBundle(snapshot)).toContain("# analytics");
  });

  it("supports searching failure audit entries", async () => {
    const { recordMonitoringIncident } = await import("./incidents");
    recordMonitoringIncident({
      kind: "api_500",
      targetId: "api",
      message: "API500",
      critical: false,
    });

    const { listOwnerAuditLogs } = await import("@/lib/owner/audit-log/service");
    const found = await listOwnerAuditLogs({
      result: "failure",
      q: "api_500",
    });
    expect(found.total).toBeGreaterThanOrEqual(1);
  });
});
