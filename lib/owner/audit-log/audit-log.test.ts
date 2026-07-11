import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
}));

describe("audit log", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetAuditLogStoreForTests } = await import("./store");
    const { resetAuditLogDurableForTests } = await import("./durable");
    resetAuditLogStoreForTests();
    resetAuditLogDurableForTests();
  });

  it("records login success with request context fields", async () => {
    const { recordAuditLog } = await import("./record");
    const { listAuditLogEntries } = await import("./store");

    const entry = await recordAuditLog({
      userId: "user_1",
      email: "a@example.com",
      ip: "203.0.113.10",
      userAgent: "VitestAgent/1.0",
      category: "auth",
      action: "login",
      targetId: "sess_1",
      result: "success",
      reason: "Clerk session.created",
    });

    expect(entry.action).toBe("login");
    expect(listAuditLogEntries()[0]?.ip).toBe("203.0.113.10");
    expect(listAuditLogEntries()[0]?.userAgent).toContain("VitestAgent");
  });

  it("records stripe payment and cancel", async () => {
    const { recordAuditLog } = await import("./record");
    const { filterAuditLogEntries } = await import("./service");
    const { listAuditLogEntries } = await import("./store");

    await recordAuditLog({
      userId: "user_paid",
      category: "billing",
      action: "stripe_payment",
      targetId: "standard",
      result: "success",
      reason: "invoice.paid",
    });
    await recordAuditLog({
      userId: "user_paid",
      category: "billing",
      action: "stripe_cancel",
      targetId: "standard",
      result: "success",
      reason: "subscription deleted",
    });

    const payments = filterAuditLogEntries(listAuditLogEntries(), {
      action: undefined,
      category: "billing",
      q: "stripe_payment",
    });
    expect(payments.some((row) => row.action === "stripe_payment")).toBe(true);
    expect(
      listAuditLogEntries().some((row) => row.action === "stripe_cancel"),
    ).toBe(true);
  });

  it("records automation and commander success/failure", async () => {
    const { recordAuditLog } = await import("./record");
    const { listAuditLogEntries } = await import("./store");

    await recordAuditLog({
      userId: "u1",
      category: "automation",
      action: "automation_run",
      targetId: "auto_1",
      result: "success",
    });
    await recordAuditLog({
      userId: "u1",
      category: "commander",
      action: "commander_run",
      targetId: "run_1",
      result: "failure",
      reason: "timeout",
    });

    const rows = listAuditLogEntries();
    expect(rows.find((r) => r.action === "automation_run")?.result).toBe(
      "success",
    );
    expect(rows.find((r) => r.action === "commander_run")?.result).toBe(
      "failure",
    );
  });

  it("records google connect and data export", async () => {
    const { recordAuditLog } = await import("./record");
    const { listAuditLogEntries } = await import("./store");

    await recordAuditLog({
      userId: "u1",
      category: "integration",
      action: "google_connect",
      targetId: "google",
      result: "success",
    });
    await recordAuditLog({
      userId: "u1",
      category: "data",
      action: "data_export",
      targetId: "atlas-export.csv",
      result: "success",
    });

    expect(
      listAuditLogEntries().map((r) => r.action),
    ).toEqual(expect.arrayContaining(["google_connect", "data_export"]));
  });

  it("records account deletion and redacts secrets", async () => {
    const { recordAuditLog } = await import("./record");
    const { redactSensitiveText } = await import("./sanitize");
    const { listAuditLogEntries } = await import("./store");

    expect(
      redactSensitiveText("token=sk_live_abc password=hunter2"),
    ).toContain("[REDACTED]");

    await recordAuditLog({
      userId: "u1",
      category: "account",
      action: "account_purge",
      targetId: "u1",
      result: "failure",
      reason: "api_key=secret123 confirmation mismatch",
    });

    const row = listAuditLogEntries()[0];
    expect(row?.reason).not.toContain("secret123");
    expect(row?.reason).toContain("[REDACTED]");
  });

  it("searches by user, category, result, and period", async () => {
    const { recordAuditLog } = await import("./record");
    const { listOwnerAuditLogs } = await import("./service");

    await recordAuditLog({
      userId: "user_a",
      email: "a@atlas.test",
      category: "auth",
      action: "login",
      result: "success",
      at: "2026-07-01T00:00:00.000Z",
    });
    await recordAuditLog({
      userId: "user_b",
      email: "b@atlas.test",
      category: "billing",
      action: "stripe_payment",
      result: "failure",
      at: "2026-07-10T00:00:00.000Z",
    });

    const byUser = await listOwnerAuditLogs({ userId: "user_a" });
    expect(byUser.total).toBe(1);
    expect(byUser.entries[0]?.action).toBe("login");

    const byCategory = await listOwnerAuditLogs({ category: "billing" });
    expect(byCategory.total).toBe(1);

    const byResult = await listOwnerAuditLogs({ result: "failure" });
    expect(byResult.total).toBe(1);

    const byPeriod = await listOwnerAuditLogs({
      from: "2026-07-05T00:00:00.000Z",
      to: "2026-07-11T00:00:00.000Z",
    });
    expect(byPeriod.total).toBe(1);
    expect(byPeriod.entries[0]?.userId).toBe("user_b");
  });

  it("exports CSV with required columns", async () => {
    const { recordAuditLog } = await import("./record");
    const { auditLogsToCsv, listOwnerAuditLogs } = await import("./service");

    await recordAuditLog({
      userId: "user_csv",
      email: "csv@atlas.test",
      ip: "127.0.0.1",
      userAgent: "csv-agent",
      category: "data",
      action: "data_export",
      targetId: "file.csv",
      result: "success",
      reason: "download",
    });

    const snapshot = await listOwnerAuditLogs({});
    const csv = auditLogsToCsv(snapshot.entries);
    expect(csv).toContain("userId,email,ip,userAgent,category,action");
    expect(csv).toContain("user_csv");
    expect(csv).toContain("data_export");
  });

  it("supports 30 / 90 / 365 day retention and prunes older rows", async () => {
    const { recordAuditLog } = await import("./record");
    const { updateAuditRetention, listOwnerAuditLogs } = await import(
      "./service"
    );
    const { listAuditLogEntries } = await import("./store");

    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 40);

    await recordAuditLog({
      userId: "old",
      category: "auth",
      action: "login",
      result: "success",
      at: old.toISOString(),
    });
    await recordAuditLog({
      userId: "new",
      category: "auth",
      action: "login",
      result: "success",
    });

    await updateAuditRetention(30);
    const after30 = await listOwnerAuditLogs({});
    expect(after30.settings.retentionDays).toBe(30);
    expect(listAuditLogEntries().every((r) => r.userId === "new")).toBe(true);

    await updateAuditRetention(90);
    expect((await listOwnerAuditLogs({})).settings.retentionDays).toBe(90);
    await updateAuditRetention(365);
    expect((await listOwnerAuditLogs({})).settings.retentionDays).toBe(365);
  });
});
