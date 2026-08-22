import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyCoreReadiness,
  collectCoreReadiness,
  coreReadinessHttpStatus,
  type CoreReadinessChecks,
} from "./core-readiness";

function healthyChecks(
  overrides: Partial<CoreReadinessChecks> = {},
): CoreReadinessChecks {
  return {
    supabaseConfigured: true,
    serviceRoleConfigured: true,
    supabaseReachable: true,
    billingStore: "ok",
    automationStore: "ok",
    workJobStore: "ok",
    openaiConfigured: true,
    integrationsConfigured: true,
    sharpRuntime: "ok",
    ...overrides,
  };
}

function tableClient(
  responses: Record<string, { error: { message?: string; code?: string } | null }>,
) {
  return {
    from: (table: string) => ({
      select: () => ({
        limit: async () =>
          responses[table] ?? { error: { message: "fetch failed" } },
      }),
    }),
  };
}

describe("P5 core readiness classification", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("J: all required checks pass as healthy", () => {
    expect(classifyCoreReadiness(healthyChecks())).toBe("healthy");
    expect(coreReadinessHttpStatus("healthy")).toBe(200);
  });

  it("J: missing OpenAI or sharp is degraded, not healthy", () => {
    expect(
      classifyCoreReadiness(healthyChecks({ openaiConfigured: false })),
    ).toBe("degraded");
    expect(
      classifyCoreReadiness(healthyChecks({ sharpRuntime: "unavailable" })),
    ).toBe("degraded");
    expect(coreReadinessHttpStatus("degraded")).toBe(200);
  });

  it("A: Supabase unavailable is unhealthy", () => {
    expect(
      classifyCoreReadiness(
        healthyChecks({
          supabaseConfigured: false,
          serviceRoleConfigured: false,
          supabaseReachable: false,
        }),
      ),
    ).toBe("unhealthy");
    expect(coreReadinessHttpStatus("unhealthy")).toBe(503);
  });

  it("B: schema missing on a required store is unhealthy", () => {
    expect(
      classifyCoreReadiness(healthyChecks({ billingStore: "missing" })),
    ).toBe("unhealthy");
    expect(
      classifyCoreReadiness(healthyChecks({ automationStore: "missing" })),
    ).toBe("unhealthy");
    expect(
      classifyCoreReadiness(healthyChecks({ workJobStore: "missing" })),
    ).toBe("unhealthy");
  });

  it("collects injected probes without calling OpenAI", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-not-a-real-key");
    vi.stubEnv("OPENAI_API_KEY", "sk-test-not-used");
    vi.stubEnv("X_CLIENT_ID", "x-client");

    const snapshot = await collectCoreReadiness({
      probeSharp: async () => ({ ok: true }),
      probeClient: tableClient({
        atlas_billing_usage_counters: { error: null },
        atlas_automation_definitions: { error: null },
        atlas_work_jobs: { error: null },
      }),
    });
    expect(snapshot.readiness).toBe("healthy");
    expect(snapshot.checks.openaiConfigured).toBe(true);
  });

  it("A/B: unreachable or missing tables stay fail-closed", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-not-a-real-key");

    const down = await collectCoreReadiness({
      probeSharp: async () => ({ ok: true }),
      probeClient: tableClient({}),
    });
    expect(down.readiness).toBe("unhealthy");
    expect(down.checks.supabaseReachable).toBe(false);

    const missing = await collectCoreReadiness({
      probeSharp: async () => ({ ok: true }),
      probeClient: tableClient({
        atlas_billing_usage_counters: {
          error: {
            code: "PGRST205",
            message:
              "Could not find the table 'public.atlas_billing_usage_counters' in the schema cache",
          },
        },
        atlas_automation_definitions: { error: null },
        atlas_work_jobs: { error: null },
      }),
    });
    expect(missing.checks.billingStore).toBe("missing");
    expect(missing.readiness).toBe("unhealthy");
  });

  it("C: sharp unavailable degrades readiness", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-not-a-real-key");
    vi.stubEnv("OPENAI_API_KEY", "sk-test-not-used");
    vi.stubEnv("X_CLIENT_ID", "x-client");

    const snapshot = await collectCoreReadiness({
      probeSharp: async () => ({ ok: false }),
      probeClient: tableClient({
        atlas_billing_usage_counters: { error: null },
        atlas_automation_definitions: { error: null },
        atlas_work_jobs: { error: null },
      }),
    });
    expect(snapshot.checks.sharpRuntime).toBe("unavailable");
    expect(snapshot.readiness).toBe("degraded");
  });
});
