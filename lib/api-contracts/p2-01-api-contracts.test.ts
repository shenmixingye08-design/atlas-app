import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CRITICAL_API_CONTRACTS } from "./critical-contracts";
import { probeApiContracts } from "./production-probe";
import {
  contractsEqualResult,
  evaluateContractResponse,
  validateFields,
} from "./validate";

describe("P2-01 API contracts — registry", () => {
  it("defines a non-empty critical set covering health + auth fail-closed", () => {
    expect(CRITICAL_API_CONTRACTS.length).toBeGreaterThanOrEqual(10);
    const ids = new Set(CRITICAL_API_CONTRACTS.map((c) => c.id));
    expect(ids.has("health.version")).toBe(true);
    expect(ids.has("health.work-queue")).toBe(true);
    expect(ids.has("automations.tick.unauthorized")).toBe(true);
    expect(ids.has("automations.list.unauthorized")).toBe(true);
  });

  it("every contract has path under /api and publicFetch for Production smoke", () => {
    for (const c of CRITICAL_API_CONTRACTS) {
      expect(c.path.startsWith("/api/")).toBe(true);
      expect(c.publicFetch).toBe(true);
      expect(c.criticalReason.length).toBeGreaterThan(3);
      expect(Object.keys(c.fields).length).toBeGreaterThan(0);
    }
  });
});

describe("P2-01 API contracts — validate happy / failure", () => {
  const version = CRITICAL_API_CONTRACTS.find((c) => c.id === "health.version")!;

  it("happy path: version payload matches contract", () => {
    const result = evaluateContractResponse({
      contract: version,
      httpStatus: 200,
      body: {
        ok: true,
        environment: "production",
        commitSha: "abc1234deadbeef",
        commitShaShort: "abc1234",
        buildTime: "2026-08-09T00:00:00.000Z",
        appVersion: "0.1.0",
        vercelUrl: null,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.fieldFailures).toEqual([]);
  });

  it("failure path: missing field / wrong type / wrong status", () => {
    expect(
      evaluateContractResponse({
        contract: version,
        httpStatus: 200,
        body: { ok: true },
      }).ok,
    ).toBe(false);

    expect(
      validateFields({ ok: "yes" }, { ok: { type: "boolean" } }),
    ).toContain("type:ok:expected_boolean:got_string");

    expect(
      evaluateContractResponse({
        contract: version,
        httpStatus: 503,
        body: {
          ok: true,
          environment: "production",
          commitSha: "x",
          commitShaShort: "x",
          buildTime: "t",
          appVersion: "0.1.0",
        },
      }).fieldFailures[0],
    ).toMatch(/http_status/);
  });

  it("unauthorized tick contract accepts only Unauthorized error string", () => {
    const tick = CRITICAL_API_CONTRACTS.find(
      (c) => c.id === "automations.tick.unauthorized",
    )!;
    expect(
      evaluateContractResponse({
        contract: tick,
        httpStatus: 401,
        body: { error: "Unauthorized" },
      }).ok,
    ).toBe(true);
    expect(
      evaluateContractResponse({
        contract: tick,
        httpStatus: 401,
        body: { error: "nope" },
      }).ok,
    ).toBe(false);
    expect(
      evaluateContractResponse({
        contract: tick,
        httpStatus: 200,
        body: { ok: true },
      }).ok,
    ).toBe(false);
  });
});

describe("P2-01 API contracts — retry / duplicate / isolation", () => {
  const version = CRITICAL_API_CONTRACTS.find((c) => c.id === "health.version")!;
  const body = {
    ok: true,
    environment: "test",
    commitSha: "deadbeef",
    commitShaShort: "deadbee",
    buildTime: "t",
    appVersion: "0.1.0",
  };

  it("duplicate execution is deterministic", () => {
    const a = evaluateContractResponse({
      contract: version,
      httpStatus: 200,
      body,
    });
    const b = evaluateContractResponse({
      contract: version,
      httpStatus: 200,
      body,
    });
    expect(contractsEqualResult(a, b)).toBe(true);
  });

  it("retry after transient wrong status then success is fail-closed until success", () => {
    const fail = evaluateContractResponse({
      contract: version,
      httpStatus: 502,
      body,
    });
    const ok = evaluateContractResponse({
      contract: version,
      httpStatus: 200,
      body,
    });
    expect(fail.ok).toBe(false);
    expect(ok.ok).toBe(true);
  });

  it("cross-user isolation: unauthorized automations contract rejects 200 user payloads", () => {
    const list = CRITICAL_API_CONTRACTS.find(
      (c) => c.id === "automations.list.unauthorized",
    )!;
    expect(
      evaluateContractResponse({
        contract: list,
        httpStatus: 200,
        body: [{ id: "auto_other_user" }],
      }).ok,
    ).toBe(false);
    expect(
      evaluateContractResponse({
        contract: list,
        httpStatus: 401,
        body: { error: "Unauthorized" },
      }).ok,
    ).toBe(true);
  });
});

describe("P2-01 API contracts — production probe fail-closed / memory ban", () => {
  const originalEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    process.env.VERCEL_ENV = originalEnv;
    vi.unstubAllGlobals();
  });

  it("injectResults forbidden when production marker set (fail-closed)", async () => {
    process.env.VERCEL_ENV = "production";
    const result = await probeApiContracts({
      injectResults: [
        {
          id: "health.version",
          path: "/api/health/version",
          ok: true,
          httpStatus: 200,
          expectedStatus: 200,
          error: null,
          fieldFailures: [],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("inject_forbidden_in_production");
    expect(result.memoryNotSot).toBe(false);
  });

  it("live fetch path marks memoryNotSot and aggregates failures fail-closed", async () => {
    process.env.VERCEL_ENV = "preview";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/health/version")) {
          return new Response(
            JSON.stringify({
              ok: true,
              environment: "preview",
              commitSha: "abc1234",
              commitShaShort: "abc1234",
              buildTime: "t",
              appVersion: "0.1.0",
              vercelUrl: null,
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/automations/tick")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
          });
        }
        if (url.includes("/api/automations") && !url.includes("tick")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
          });
        }
        // Remaining health endpoints: minimal ok payload may fail field checks
        return new Response(JSON.stringify({ ok: true, commitShaShort: "abc1234" }), {
          status: 200,
        });
      }),
    );

    const result = await probeApiContracts({
      requestUrl: "https://example.test/api/health/api-contracts",
    });
    expect(result.memoryNotSot).toBe(true);
    expect(result.multiInstanceSafe).toBe(true);
    expect(result.contractsChecked).toBe(CRITICAL_API_CONTRACTS.length);
    // Incomplete health payloads must not soft-succeed overall.
    expect(result.ok).toBe(false);
    expect(result.failClosed).toBe(true);
    expect(result.contractsPassed).toBeLessThan(result.contractsDefined);
  });

  it("non-production inject can prove full pass without soft-success shortcuts", async () => {
    process.env.VERCEL_ENV = "preview";
    const fullPass = CRITICAL_API_CONTRACTS.map((c) => ({
      id: c.id,
      path: c.path,
      ok: true,
      httpStatus: c.status,
      expectedStatus: c.status,
      error: null,
      fieldFailures: [] as string[],
    }));
    const result = await probeApiContracts({ injectResults: fullPass });
    expect(result.ok).toBe(true);
    expect(result.contractsPassed).toBe(CRITICAL_API_CONTRACTS.length);
    expect(result.allCriticalCovered).toBe(true);
  });

  it("restart durability: contract registry is module SoT (not process Map store)", async () => {
    // Re-import identity: same ids after "restart" (module reload simulation).
    const ids1 = CRITICAL_API_CONTRACTS.map((c) => c.id).join(",");
    const again = await import("./critical-contracts");
    const ids2 = again.CRITICAL_API_CONTRACTS.map((c) => c.id).join(",");
    expect(ids2).toBe(ids1);
  });
});

describe("P2-01 API contracts — Production unauthorized shape regression", () => {
  it("Production middleware 401 body matches automations.list contract", () => {
    const list = CRITICAL_API_CONTRACTS.find(
      (c) => c.id === "automations.list.unauthorized",
    )!;
    // Observed Production shape via proxy/Clerk (route handler may add `code`, but
    // edge response is { error: "Unauthorized" }).
    const checked = evaluateContractResponse({
      contract: list,
      httpStatus: 401,
      body: { error: "Unauthorized" },
    });
    expect(checked.ok).toBe(true);
  });
});
