import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  correlationFromHeaders,
  createCorrelationIds,
  runWithCorrelation,
} from "./correlation";
import {
  getLatencyPercentiles,
  incrementProductionCounter,
  recordLatency,
  resetProductionMetricsForTests,
  sampleProcessGauges,
} from "./metrics";
import { enforceScopedRateLimit, getRateLimitScopeConfig } from "./rate-limit-scopes";
import { redactPiiAndSecrets } from "./security";
import {
  listStructuredLogsForTests,
  resetStructuredLogsForTests,
  structuredLog,
} from "./structured-log";
import {
  endSpan,
  listTraceSpansForTests,
  resetTracingForTests,
  startSpan,
} from "./tracing";
import { getBackupReadinessSnapshot } from "./backup-catalog";
import { resetRateLimitBucket } from "@/lib/http/rate-limit";

beforeEach(() => {
  resetProductionMetricsForTests();
  resetStructuredLogsForTests();
  resetTracingForTests();
  resetRateLimitBucket("prod-user");
  resetRateLimitBucket("prod-ip");
  resetRateLimitBucket("prod-automation");
});

describe("production observability", () => {
  it("creates correlation ids and propagates in runWithCorrelation", () => {
    const ids = createCorrelationIds({ runId: "run_1", jobId: "job_1" });
    expect(ids.correlationId).toMatch(/^cor_/);
    const seen = runWithCorrelation(ids, () => {
      structuredLog("info", "hello", { event: "test" });
      return true;
    });
    expect(seen).toBe(true);
    const logs = listStructuredLogsForTests();
    expect(logs[0]?.correlationId).toBe(ids.correlationId);
    expect(logs[0]?.runId).toBe("run_1");
  });

  it("parses correlation headers", () => {
    const headers = new Headers({
      "x-correlation-id": "cor_abc",
      "x-atlas-run-id": "run_x",
      "x-atlas-artifact-id": "art_1",
      "x-atlas-diagnostic-id": "diag_1",
    });
    const ids = correlationFromHeaders(headers);
    expect(ids.correlationId).toBe("cor_abc");
    expect(ids.runId).toBe("run_x");
    expect(ids.artifactId).toBe("art_1");
    expect(ids.diagnosticId).toBe("diag_1");
  });

  it("records latency percentiles", () => {
    for (let i = 1; i <= 100; i += 1) recordLatency("api.test", i);
    const stats = getLatencyPercentiles("api.test");
    expect(Array.isArray(stats) ? null : stats.p95).toBeGreaterThanOrEqual(95);
    expect(Array.isArray(stats) ? null : stats.p99).toBeGreaterThanOrEqual(99);
  });

  it("samples process gauges", () => {
    const gauges = sampleProcessGauges();
    expect(gauges.heapUsedMb).toBeGreaterThan(0);
    expect(gauges.uptimeSec).toBeGreaterThanOrEqual(0);
  });

  it("traces spans", () => {
    const span = startSpan("unit");
    endSpan(span, "ok");
    expect(listTraceSpansForTests().some((s) => s.name === "unit")).toBe(true);
  });

  it("enforces user/ip/automation rate limits", () => {
    const cfg = getRateLimitScopeConfig();
    expect(cfg.user.max).toBeGreaterThan(0);
    expect(cfg.ip.max).toBeGreaterThan(0);
    expect(cfg.automation.max).toBeGreaterThan(0);

    let blocked = false;
    for (let i = 0; i < cfg.user.max + 5; i += 1) {
      const result = enforceScopedRateLimit("user", "u1");
      if (!result.allowed) blocked = true;
    }
    expect(blocked).toBe(true);
  });

  it("redacts PII and secrets", () => {
    const redacted = redactPiiAndSecrets(
      "mail test@example.com token Bearer abc.def.ghi",
    );
    expect(redacted).toContain("[redacted-pii]");
    expect(redacted).toContain("[redacted-secret]");
  });

  it("lists backup domains for DB/storage/automation/memory/artifact/settings", () => {
    const backup = getBackupReadinessSnapshot();
    const ids = backup.domains.map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "db",
        "storage",
        "automation",
        "memory",
        "artifact",
        "settings",
      ]),
    );
  });

  it("increments production counters", async () => {
    const { getProductionCounters } = await import("./metrics");
    incrementProductionCounter("requests", 3);
    incrementProductionCounter("failures", 1);
    expect(getProductionCounters().requests).toBe(3);
    expect(getProductionCounters().failures).toBe(1);
  });
});
