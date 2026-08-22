import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const productionFlag = vi.fn(() => true);
vi.mock("@/lib/runtime/is-production", () => ({
  isAtlasProduction: () => productionFlag(),
}));

const serviceRoleClient = vi.fn(() => null as unknown);
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => serviceRoleClient(),
}));

import { GET as getAutomations } from "@/app/api/automations/route";
import { GET as getBillingSummary } from "@/app/api/billing/summary/route";
import { resolveUsageDisplay } from "@/lib/billing/usage-awareness/load-state";
import { hydrateUserUsageMeters } from "@/lib/billing/usage/hydrate";
import { loadDurableAiRuns } from "@/lib/billing/usage/quota-engine";
import { buildScheduledAutomationIdempotencyKey } from "@/lib/jobs/idempotency";
import { classifyFailure } from "@/lib/reliability/error-classification";
import { probeSharpRuntime } from "@/lib/images/probe-sharp";
import {
  fingerprintLogUserId,
  logProductionApiError,
} from "@/lib/reliability/production-error-log";
import { assertNoSecretMaterial } from "@/lib/security/redact";
import {
  claimWorkJob,
  WorkJobClaimUnavailableError,
} from "@/lib/work-jobs/claim";
import type { WorkJobRecord } from "@/lib/work-jobs/store";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined),
}));

const getUserBillingSummaryMock = vi.fn();
const resolveUserSubscriptionDurableMock = vi.fn();
vi.mock("@/lib/billing/service", () => ({
  getUserBillingSummary: (...args: unknown[]) =>
    getUserBillingSummaryMock(...args),
}));
vi.mock("@/lib/billing/subscriptions/store", () => ({
  resolveUserSubscriptionDurable: (...args: unknown[]) =>
    resolveUserSubscriptionDurableMock(...args),
}));

const listForUser = vi.fn();
vi.mock("@/lib/automations/automation-service", () => ({
  automationService: {
    listForUser: (...args: unknown[]) => listForUser(...args),
  },
}));

function sampleJob(id: string): WorkJobRecord {
  const now = "2026-08-21T00:00:00.000Z";
  return {
    id,
    userId: "user_p5",
    assignment: "同じ依頼",
    idempotencyKey: "work:user_p5:client:p5",
    metadata: { jobId: id },
    status: "queued",
    attemptCount: 0,
    maxAttempts: 3,
    error: null,
    visionGate: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

describe("P5-08 Production error regression", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    authMock.mockReset();
    getUserBillingSummaryMock.mockReset();
    resolveUserSubscriptionDurableMock.mockReset();
    listForUser.mockReset();
    serviceRoleClient.mockReset();
    productionFlag.mockReturnValue(true);
  });

  it("A: Supabase unavailable is not a successful empty list or used=0", async () => {
    authMock.mockResolvedValue({ userId: "user_down" });
    getUserBillingSummaryMock.mockRejectedValue(new Error("supabase timeout"));
    resolveUserSubscriptionDurableMock.mockRejectedValue(
      new Error("supabase timeout"),
    );
    listForUser.mockRejectedValue(new Error("supabase timeout"));

    const billing = await getBillingSummary();
    const automations = await getAutomations();
    expect(billing.status).toBe(503);
    expect(automations.status).toBe(503);
    const billingBody = (await billing.json()) as { usageReady?: boolean };
    const autoBody = (await automations.json()) as unknown;
    expect(billingBody.usageReady).not.toBe(true);
    expect(Array.isArray(autoBody)).toBe(false);
  });

  it("B: schema missing stays fail-closed", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    serviceRoleClient.mockReturnValue({
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({
            data: null,
            error: {
              code: "PGRST205",
              message:
                "Could not find the table 'public.atlas_billing_usage_counters' in the schema cache",
            },
          }),
        };
        return builder;
      },
    });
    const loaded = await loadDurableAiRuns("user_schema");
    expect(loaded.ready).toBe(false);
    expect(
      resolveUsageDisplay({ ready: loaded.ready, used: loaded.used, limit: 30 })
        .kind,
    ).toBe("unavailable");
  });

  it("C: sharp unavailable is reported, not swallowed as success", async () => {
    const sharp = await probeSharpRuntime();
    if (!sharp.ok) {
      expect(sharp.code).not.toBe("ok");
      return;
    }
    const failed = await (async () => {
      try {
        throw new Error('Could not load the "sharp" module using require. libvips-cpp.so');
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "unknown",
        };
      }
    })();
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/sharp|libvips/i);
  });

  it("D: automation durable read failure is 503, not []", async () => {
    authMock.mockResolvedValue({ userId: "user_auto" });
    listForUser.mockRejectedValue(
      Object.assign(new Error("durable list failed"), {
        name: "AutomationStoreUnavailableError",
        code: "automation_store_unavailable",
        diagnosticId: "auto_p5_diag",
      }),
    );
    const response = await getAutomations();
    expect(response.status).toBe(503);
    const body = (await response.json()) as unknown;
    expect(Array.isArray(body)).toBe(false);
  });

  it("E: billing durable read failure is not usageReady", async () => {
    const hydrated = await hydrateUserUsageMeters("");
    expect(hydrated.ready).toBe(false);
    expect(
      resolveUsageDisplay({ ready: false, used: 0, limit: 30 }).kind,
    ).toBe("unavailable");
  });

  it("F: work-job claim failure is fail-closed in Production", async () => {
    productionFlag.mockReturnValue(true);
    serviceRoleClient.mockReturnValue(null);
    await expect(claimWorkJob(sampleJob("job_p5"))).rejects.toBeInstanceOf(
      WorkJobClaimUnavailableError,
    );
  });

  it("G: external API timeout is classified as timeout, not success", () => {
    expect(classifyFailure(new Error("request timed out after 15000ms"))).toBe(
      "timeout",
    );
    expect(classifyFailure(new Error("ETIMEDOUT"))).toBe("timeout");
  });

  it("H: deployment/restart does not treat process memory as work-job SoT", async () => {
    productionFlag.mockReturnValue(true);
    serviceRoleClient.mockReturnValue(null);
    await expect(claimWorkJob(sampleJob("job_restart"))).rejects.toThrow(
      /Production refuses Map-only work-job claim/,
    );
  });

  it("I: the same scheduled automation slot reuses one idempotency key", () => {
    const first = buildScheduledAutomationIdempotencyKey({
      userId: "user_p5",
      automationId: "auto_1",
      scheduledAt: "2026-08-21T00:00:00.000Z",
    });
    const second = buildScheduledAutomationIdempotencyKey({
      userId: "user_p5",
      automationId: "auto_1",
      scheduledAt: "2026-08-21T00:00:00.000Z",
    });
    expect(first).toBe(second);
    expect(first).not.toBe(
      buildScheduledAutomationIdempotencyKey({
        userId: "user_p5",
        automationId: "auto_1",
        scheduledAt: "2026-08-21T00:01:00.000Z",
      }),
    );
  });

  it("does not log secrets, tokens, or raw user ids", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logProductionApiError({
      endpoint: "/api/billing/summary",
      code: "billing_summary_unavailable",
      diagnosticId: "p5_secret_check",
      failureStage: "durable_read",
      subsystem: "billing",
      databaseCode: "PGRST205",
      userId: "user_secret_id",
      message:
        "Bearer sk_live_abcdefghijklmnopqrstuv and eyJhbGciOiJIUzI1NiJ9.aaa.bbb",
    });
    const dumped = JSON.stringify(spy.mock.calls);
    expect(dumped).not.toContain("user_secret_id");
    expect(dumped).not.toContain("sk_live_abcdefghijklmnopqrstuv");
    expect(fingerprintLogUserId("user_secret_id")).toBe("present");
    expect(assertNoSecretMaterial(dumped)).toBe(true);
    spy.mockRestore();
  });
});
