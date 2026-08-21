import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

const fromMock = vi.fn();
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => {
    if (process.env.__ATLAS_USAGE_CLIENT === "none") return null;
    return {
      from: (...args: unknown[]) => fromMock(...args),
    };
  },
}));

vi.mock("@/lib/automations/automation-service", () => ({
  automationService: {
    listForUser: vi.fn(),
  },
}));

import { GET as getBillingSummary } from "@/app/api/billing/summary/route";
import { GET as getAutomations } from "@/app/api/automations/route";
import { automationService } from "@/lib/automations/automation-service";
import {
  AutomationSchemaMissingError,
  AutomationStoreUnavailableError,
} from "@/lib/automations/durable-automation-definitions";
import { isSupabaseRelationMissingError } from "@/lib/automations/supabase-error";
import { loadDurableAiRuns } from "@/lib/billing/usage/quota-engine";
import { resolveUsageDisplay } from "@/lib/billing/usage-awareness/load-state";

function usageErrorBuilder(error: { code: string; message: string }) {
  const result = { data: null, error };
  const builder: Record<string, unknown> = {};
  const method = () => builder;
  for (const key of ["select", "eq", "maybeSingle"]) {
    builder[key] = method;
  }
  builder.then = (
    resolve: (value: typeof result) => void,
    reject?: (reason: unknown) => void,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe("Production fetch hotfix — billing + automations", () => {
  beforeEach(() => {
    authMock.mockReset();
    getUserBillingSummaryMock.mockReset();
    resolveUserSubscriptionDurableMock.mockReset();
    fromMock.mockReset();
    vi.mocked(automationService.listForUser).mockReset();
    vi.unstubAllEnvs();
    delete process.env.__ATLAS_USAGE_CLIENT;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.__ATLAS_USAGE_CLIENT;
  });

  it("A: billing summary returns 200 when usage is ready", async () => {
    authMock.mockResolvedValue({ userId: "user_ok" });
    resolveUserSubscriptionDurableMock.mockResolvedValue({ planId: "free" });
    getUserBillingSummaryMock.mockResolvedValue({
      usageReady: true,
      usageError: null,
      usage: { aiRuns: { used: 3, limit: 30 } },
    });
    const response = await getBillingSummary();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { usageReady?: boolean };
    expect(body.usageReady).toBe(true);
  });

  it("B / E: automations returns 200 [] for a real empty home", async () => {
    authMock.mockResolvedValue({ userId: "user_empty" });
    vi.mocked(automationService.listForUser).mockResolvedValue([]);
    const response = await getAutomations();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("C: billing DB / schema failure is not presented as used=0", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    fromMock.mockImplementation(() =>
      usageErrorBuilder({
        code: "PGRST205",
        message:
          "Could not find the table 'public.atlas_billing_usage_counters' in the schema cache",
      }),
    );
    const loaded = await loadDurableAiRuns("user_billing_down");
    expect(loaded.ready).toBe(false);
    expect(
      resolveUsageDisplay({ ready: loaded.ready, used: loaded.used, limit: 30 })
        .kind,
    ).toBe("unavailable");
  });

  it("D: automation store failure is 503, not a successful []", async () => {
    authMock.mockResolvedValue({ userId: "user_auto_down" });
    vi.mocked(automationService.listForUser).mockRejectedValue(
      new AutomationStoreUnavailableError(
        "durable list failed",
        "auto_list_hotfix_diag",
      ),
    );
    const response = await getAutomations();
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      code?: string;
      requestId?: string;
    };
    expect(body.code).toBe("automation_store_unavailable");
    expect(body.requestId).toBe("auto_list_hotfix_diag");
    expect(Array.isArray(body)).toBe(false);
  });

  it("F: unauthorized billing and automations return 401", async () => {
    authMock.mockResolvedValue({ userId: null });
    const billing = await getBillingSummary();
    const automations = await getAutomations();
    expect(billing.status).toBe(401);
    expect(automations.status).toBe(401);
  });

  it("G: usage schema missing is classified and fail-closed", () => {
    expect(
      isSupabaseRelationMissingError({
        code: "PGRST205",
        message:
          "Could not find the table 'public.atlas_billing_usage_counters' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isSupabaseRelationMissingError({
        code: "PGRST204",
        message:
          "Could not find the 'deleted_at' column of 'atlas_automation_definitions' in the schema cache",
      }),
    ).toBe(true);
  });

  it("both APIs fail-closed when Supabase is down at the same time", async () => {
    authMock.mockResolvedValue({ userId: "user_both" });
    getUserBillingSummaryMock.mockRejectedValue(new Error("supabase timeout"));
    resolveUserSubscriptionDurableMock.mockResolvedValue({ planId: "free" });
    vi.mocked(automationService.listForUser).mockRejectedValue(
      new AutomationSchemaMissingError(
        "schema missing",
        "auto_schema_both_diag",
      ),
    );

    const billing = await getBillingSummary();
    const automations = await getAutomations();
    expect(billing.status).toBe(503);
    const billingBody = (await billing.json()) as { usageReady?: boolean };
    expect(billingBody.usageReady).not.toBe(true);
    expect(automations.status).toBe(503);
    const autoBody = (await automations.json()) as unknown;
    expect(Array.isArray(autoBody)).toBe(false);
  });

  it("Production without service role does not treat usage as ready 0", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    process.env.__ATLAS_USAGE_CLIENT = "none";
    const loaded = await loadDurableAiRuns("user_no_role");
    expect(loaded.ready).toBe(false);
    expect(
      resolveUsageDisplay({ ready: false, used: loaded.used, limit: 30 }).kind,
    ).toBe("unavailable");
  });
});
