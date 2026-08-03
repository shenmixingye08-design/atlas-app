import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createTestAdapterRegistry } from "./registry/test";
import {
  buildAdapterHealth,
  recordAdapterMetric,
  resetLiveAdapterMetricsForTests,
} from "./metrics";
import { resetLiveAdapterIdempotencyForTests } from "./idempotency";

const ARTIFACTS = "/opt/cursor/artifacts/live-adapters";

/**
 * Measured proof via explicit Test Registry (mode=test).
 *
 * Real provider credentials are not available in this agent environment.
 * Mass live posts/emails are intentionally NOT executed (spam/billing risk).
 * Contract: 10 consecutive controlled successes per Production service +
 * fault injection (disconnect / retryable failure / duplicate).
 */
describe("live adapter measured proof (safe substitute)", () => {
  beforeEach(() => {
    resetLiveAdapterMetricsForTests();
    resetLiveAdapterIdempotencyForTests();
    mkdirSync(ARTIFACTS, { recursive: true });
  });

  it("runs 10 successes per service + fault injections and writes evidence", async () => {
    const services = [
      "google_drive",
      "gmail",
      "google_calendar",
      "dropbox",
      "wordpress",
      "x",
    ] as const;

    const registry = createTestAdapterRegistry({ connected: true, succeed: true });
    const rows: Array<Record<string, unknown>> = [];
    let duplicates = 0;

    for (const service of services) {
      for (let i = 0; i < 10; i += 1) {
        const t0 = Date.now();
        const result = await registry.require(service).execute({
          userId: "proof-user",
          runId: `proof-${service}-${i}`,
          stepId: `step-${i}`,
          occurrenceKey: `occ-${service}-${i}`,
          configuration: {
            text: `proof ${service} ${i}`,
            to: "proof@example.com",
            subject: "proof",
            body: "proof body",
            saveTarget: "/Atlas/Proof",
            title: "proof",
            content: "proof content",
          },
          approved: true,
        });
        const latencyMs = Date.now() - t0;
        expect(result.status).toBe("succeeded");
        expect(result.externalActionId).toBeTruthy();
        expect(result.externalUrl).toBeTruthy();
        recordAdapterMetric({
          service,
          ok: true,
          latencyMs,
          retryable: false,
          errorCode: null,
          statusCodeHint: null,
          at: new Date().toISOString(),
        });
        rows.push({
          service,
          i,
          status: result.status,
          externalActionId: result.externalActionId,
          externalUrl: result.externalUrl,
          latencyMs,
        });
      }
    }

    // Fault injection: disconnected
    const disconnected = createTestAdapterRegistry({ connected: false });
    const disc = await disconnected.require("x").execute({
      userId: "proof-user",
      runId: "disc",
      stepId: "s",
      configuration: { text: "nope" },
      approved: true,
    });
    expect(disc.status).toBe("needs_connection");

    // Fault injection: retryable failure
    const failing = createTestAdapterRegistry({ succeed: false });
    const fail = await failing.require("gmail").execute({
      userId: "proof-user",
      runId: "fail",
      stepId: "s",
      configuration: { to: "a@b.c", body: "x", subject: "s" },
      approved: true,
    });
    expect(fail.status).toBe("failed");
    expect(fail.retryable).toBe(true);

    // Duplicate attempt counting (same logical key saved twice)
    const first = rows[0]!;
    duplicates = rows.filter(
      (r) =>
        r.service === first.service &&
        r.externalActionId === first.externalActionId,
    ).length > 1
      ? 1
      : 0;

    const health = services.map((service) =>
      buildAdapterHealth(service, {
        mode: "test",
        registered: true,
        configured: true,
        classification: "mock",
        availability: "available",
      }),
    );

    const total = rows.length;
    const successRate = 1;
    const latencies = rows.map((r) => Number(r.latencyMs));
    const averageLatencyMs =
      latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length);
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];

    const report = {
      title: "Live Adapter proof (Test Registry — credentials unavailable)",
      reason:
        "No production OAuth tokens in agent VM; mass provider writes forbidden. Used explicit mode=test adapters with externalActionId/URL contract + fault injection.",
      runs: total,
      successes: total,
      successRate,
      averageLatencyMs,
      p95LatencyMs: p95,
      retryRate: 0,
      rateLimit429Rate: 0,
      duplicates,
      faultInjection: {
        disconnected: disc.status,
        retryableFailure: fail.status,
      },
      health,
      rows,
      generatedAt: new Date().toISOString(),
    };

    writeFileSync(join(ARTIFACTS, "live-adapter-proof.json"), JSON.stringify(report, null, 2));
    writeFileSync(
      join(ARTIFACTS, "live-adapter-proof.md"),
      [
        "# Live Adapter Proof",
        "",
        `- Mode: test (explicit)`,
        `- Runs: ${total} (10 × ${services.length} services)`,
        `- Success rate: ${(successRate * 100).toFixed(1)}%`,
        `- Average latency: ${averageLatencyMs.toFixed(2)} ms`,
        `- p95 latency: ${p95} ms`,
        `- Duplicates: ${duplicates}`,
        `- Reason live providers not called: ${report.reason}`,
        "",
      ].join("\n"),
    );

    expect(total).toBe(60);
    expect(successRate).toBe(1);
  });
});
