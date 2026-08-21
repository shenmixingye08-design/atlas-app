import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

const fromMock = vi.fn();

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    from: (...args: unknown[]) => fromMock(...args),
  }),
}));

import { ensureAutomationsHydrated } from "./durable";
import {
  AutomationSchemaMissingError,
  listDurableAutomationsForOwner,
} from "./durable-automation-definitions";
import { automationService } from "./automation-service";
import {
  clearAutomationProcessCacheForTests,
  resetAutomationStore,
} from "./repositories/server-automation-repository";

function schemaMissingBuilder() {
  const result = {
    data: null,
    error: {
      code: "PGRST205",
      message:
        "Could not find the table 'public.atlas_automation_definitions' in the schema cache",
    },
  };
  const builder: Record<string, unknown> = {};
  const method = () => builder;
  for (const key of [
    "select",
    "eq",
    "is",
    "lte",
    "order",
    "limit",
    "upsert",
    "update",
    "maybeSingle",
  ]) {
    builder[key] = method;
  }
  // Awaitable query builder (supabase-js thenable).
  builder.then = (
    resolve: (value: typeof result) => void,
    reject?: (reason: unknown) => void,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe("home load when P0-6 schema is missing", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ATLAS_AUTOMATION_STORAGE", "supabase");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
    resetAutomationStore({ seed: false });
    clearAutomationProcessCacheForTests();
    fromMock.mockImplementation(() => schemaMissingBuilder());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fromMock.mockReset();
  });

  it("listDurableAutomationsForOwner throws AutomationSchemaMissingError", async () => {
    await expect(listDurableAutomationsForOwner("user_home")).rejects.toBeInstanceOf(
      AutomationSchemaMissingError,
    );
  });

  it("ensureAutomationsHydrated fail-closes — schema missing is not a successful []", async () => {
    await expect(ensureAutomationsHydrated("user_home")).rejects.toBeInstanceOf(
      AutomationSchemaMissingError,
    );
    await expect(automationService.listForUser("user_home")).rejects.toBeInstanceOf(
      AutomationSchemaMissingError,
    );
  });
});
