import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildExecutionResult } from "./result";
import {
  assertProductionDisallowsSandbox,
  resolveAdapterRuntimeMode,
} from "./mode";
import {
  buildIdempotencyKey,
  getIdempotentResult,
  hashContent,
  resetLiveAdapterIdempotencyForTests,
  saveIdempotentResult,
} from "./idempotency";
import { createAdapterRegistry } from "./registry/create-registry";
import { createTestAdapterRegistry } from "./registry/test";
import {
  resetAdapterRegistryCacheForTests,
} from "./registry/resolve";
import { resetLiveAdapterMetricsForTests } from "./metrics";
import { ADAPTER_AUDIT_INVENTORY } from "./inventory";
import { defaultStepInvoker } from "@/lib/automation-platform/execution/step-invoker";

describe("adapter runtime mode", () => {
  it("1-3. resolves production / preview / test registries modes", () => {
    expect(
      resolveAdapterRuntimeMode({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("production");
    expect(
      resolveAdapterRuntimeMode({
        VERCEL_ENV: "preview",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("preview");
    expect(
      resolveAdapterRuntimeMode({
        VITEST: "true",
        NODE_ENV: "test",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("test");
  });

  it("4. Production sandbox flags fail-closed", () => {
    expect(() =>
      assertProductionDisallowsSandbox("production"),
    ).not.toThrow();
    const prev = process.env.USE_SANDBOX;
    process.env.USE_SANDBOX = "true";
    expect(() => assertProductionDisallowsSandbox("production")).toThrow(
      /sandbox/i,
    );
    if (prev == null) delete process.env.USE_SANDBOX;
    else process.env.USE_SANDBOX = prev;
  });
});

describe("registries", () => {
  beforeEach(() => {
    resetAdapterRegistryCacheForTests();
    resetLiveAdapterIdempotencyForTests();
    resetLiveAdapterMetricsForTests();
  });

  it("1. Test Registry has explicit mode=test adapters", () => {
    const registry = createTestAdapterRegistry();
    expect(registry.mode).toBe("test");
    expect(registry.list().every((a) => a.mode === "test")).toBe(true);
    expect(registry.get("x")?.classification).toBe("mock");
  });

  it("5. Adapter missing fail-closed", () => {
    const registry = createAdapterRegistry("test", []);
    expect(registry.get("x")).toBeNull();
    expect(() => registry.require("x")).toThrow(/missing/i);
  });

  it("rejects non-production adapters in production registry builder", () => {
    const mock = createTestAdapterRegistry().require("x");
    expect(() => createAdapterRegistry("production", [mock])).toThrow(
      /non-production|non-live/i,
    );
  });
});

describe("execution result / evidence", () => {
  it("22. externalActionId required for success", () => {
    const result = buildExecutionResult({
      status: "succeeded",
      startedAt: new Date().toISOString(),
      summary: "ok",
      requiresExternalActionId: true,
      externalActionId: null,
    });
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("missing_external_action_id");
  });

  it("rejects fake externalActionId", () => {
    const result = buildExecutionResult({
      status: "succeeded",
      startedAt: new Date().toISOString(),
      summary: "ok",
      externalActionId: "fake-123",
      externalUrl: "https://example.com",
      requiresExternalActionId: true,
    });
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("fake_external_action_id");
  });
});

describe("idempotency / duplicate prevention", () => {
  beforeEach(() => {
    resetLiveAdapterIdempotencyForTests();
  });

  it("12. duplicate prevention via idempotency key", async () => {
    const registry = createTestAdapterRegistry();
    const adapter = registry.require("x");
    const input = {
      userId: "u1",
      runId: "run1",
      stepId: "step1",
      occurrenceKey: "occ1",
      configuration: { text: "hello" },
      approved: true,
      contentHash: hashContent("hello"),
    };
    const key = buildIdempotencyKey({
      runId: input.runId,
      stepId: input.stepId,
      provider: "x",
      account: input.userId,
      contentHash: input.contentHash,
      occurrenceKey: input.occurrenceKey,
    });
    const first = await adapter.execute(input);
    expect(first.status).toBe("succeeded");
    saveIdempotentResult(key, first);
    const cached = getIdempotentResult(key);
    expect(cached?.externalActionId).toBe(first.externalActionId);
  });
});

describe("default invoker fail-closed", () => {
  it("forbids draft success for external steps", async () => {
    const result = await defaultStepInvoker({
      step: {
        id: "s1",
        type: "x_post",
        name: "X",
        order: 0,
        inputBindings: {},
        configuration: { text: "hi" },
        requiresApproval: true,
        retryPolicy: { maxAttempts: 1, backoffMs: [10] },
        timeoutMs: 1000,
        onSuccess: null,
        onFailure: null,
        enabled: true,
      },
      userId: "u",
      automationName: "t",
      runId: "r",
      approved: true,
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/live_adapter/);
  });
});

describe("connection / config gates", () => {
  it("6-7. missing config / disconnected adapter surfaces needs_*", async () => {
    const registry = createTestAdapterRegistry({ connected: false });
    const result = await registry.require("gmail").execute({
      userId: "u",
      runId: "r",
      stepId: "s",
      configuration: { to: "a@example.com", body: "hi", subject: "s" },
      approved: true,
    });
    expect(result.status).toBe("needs_connection");
  });

  it("10-11. retryable vs failed", async () => {
    const registry = createTestAdapterRegistry({ succeed: false });
    const result = await registry.require("dropbox").execute({
      userId: "u",
      runId: "r",
      stepId: "s",
      configuration: { saveTarget: "/Atlas" },
      approved: true,
    });
    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(true);
  });
});

describe("inventory", () => {
  it("lists unsupported services as unsupported/stub not production_live", () => {
    const unsupported = ADAPTER_AUDIT_INVENTORY.filter((row) =>
      ["Slack", "Discord", "Notion", "Teams", "YouTube"].includes(row.service),
    );
    expect(unsupported.length).toBeGreaterThan(0);
    expect(
      unsupported.every(
        (row) =>
          row.classification === "unsupported" ||
          row.classification === "stub",
      ),
    ).toBe(true);
  });
});

describe("test registry live-shaped success", () => {
  it("13-21. services succeed only with externalActionId + url", async () => {
    const registry = createTestAdapterRegistry();
    for (const service of [
      "google_drive",
      "gmail",
      "google_calendar",
      "dropbox",
      "wordpress",
      "x",
    ] as const) {
      const result = await registry.require(service).execute({
        userId: "u",
        runId: "run",
        stepId: service,
        configuration: { text: "body", to: "a@b.c", saveTarget: "/x" },
        approved: true,
      });
      expect(result.status).toBe("succeeded");
      expect(result.externalActionId).toBeTruthy();
      expect(result.externalUrl).toBeTruthy();
      expect(result.externalActionId).not.toMatch(/^(stub|fake|mock)/i);
    }
  });
});
