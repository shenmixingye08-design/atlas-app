/**
 * Measured production integration durability (mocked HTTP / in-process adapters).
 * Covers X / Gmail / Calendar / WordPress / Dropbox — 500 runs total.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import {
  listIntegrationAuditRecords,
  resetIntegrationAuditForTests,
  summarizeIntegrationAudit,
} from "@/lib/integrations/production/audit";
import { resetIntegrationIdempotencyForTests } from "@/lib/integrations/production/idempotency";
import {
  IntegrationHttpError,
  withIntegrationRetry,
} from "@/lib/integrations/production/retry";
import { runIntegrationAction } from "@/lib/integrations/production/execute";
import { buildIdempotencyKey } from "@/lib/integrations/production/idempotency";
import { normalizeTweetText } from "@/lib/integrations/production/x/text-normalize";
import { listProductionConnectors } from "@/lib/integrations/production/connector-registry";
import {
  markOAuthCancelled,
  recordOAuthLifecycleEvent,
  resetOAuthLifecycleForTests,
} from "@/lib/integrations/production/oauth-lifecycle";

const TOTAL_RUNS = Number(process.env.INTEGRATION_DURABILITY_RUNS ?? 500);
const PER_SERVICE = Math.floor(TOTAL_RUNS / 5);

type RunMetric = {
  integration: string;
  success: boolean;
  duplicate: boolean;
  timeout: boolean;
  retry: number;
  durationMs: number;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * p) - 1),
  );
  return sorted[idx] ?? 0;
}

describe("integration production durability 500", () => {
  beforeEach(() => {
    resetIntegrationAuditForTests();
    resetIntegrationIdempotencyForTests();
    resetOAuthLifecycleForTests();
  });

  afterEach(() => {
    resetIntegrationAuditForTests();
    resetIntegrationIdempotencyForTests();
    resetOAuthLifecycleForTests();
  });

  it("registers extensible production connectors", () => {
    const ids = listProductionConnectors().map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "x",
        "gmail",
        "google_calendar",
        "wordpress",
        "dropbox",
      ]),
    );
  });

  it(
    `runs ${TOTAL_RUNS} integration actions with retry/audit/dedupe`,
    async () => {
      const metrics: RunMetric[] = [];
      let forced429 = 0;
      let forcedTimeout = 0;

      async function runService(
        integration: string,
        action: string,
        index: number,
      ): Promise<void> {
        const fingerprint = `${integration}:${action}:${index}`;
        const idempotencyKey = buildIdempotencyKey({
          integration,
          action,
          userId: "durability-user",
          fingerprint,
        });

        // Inject a controlled failure on every 17th attempt of first pass.
        const should429 = index % 17 === 0;
        const shouldTimeout = index % 23 === 0 && !should429;
        let attempts = 0;

        const started = Date.now();
        try {
          const executed = await runIntegrationAction(
            {
              integration,
              action,
              userId: "durability-user",
              idempotencyKey,
              preventDuplicate: true,
              maxAttempts: 4,
            },
            async () => {
              attempts += 1;
              if (should429 && attempts === 1) {
                forced429 += 1;
                throw new IntegrationHttpError(429, "rate limited", {
                  retryAfterMs: 1,
                });
              }
              if (shouldTimeout && attempts === 1) {
                forcedTimeout += 1;
                throw new Error("Request timed out");
              }

              // Simulate service-specific payload handling.
              if (integration === "x") {
                const text = normalizeTweetText(
                  `耐久投稿 ${index}\n#MINERVOT https://example.com/${index}`,
                );
                return { tweetId: `tw_${index}`, text };
              }
              if (integration === "gmail") {
                return {
                  id: `msg_${index}`,
                  threadId: `thr_${index}`,
                  html: true,
                  cc: ["cc@example.com"],
                };
              }
              if (integration === "google_calendar") {
                return {
                  id: `evt_${index}`,
                  timeZone: "Asia/Tokyo",
                  attendees: ["a@example.com"],
                  remindMinutesBefore: 15,
                };
              }
              if (integration === "wordpress") {
                return {
                  postId: index,
                  status: index % 2 === 0 ? "publish" : "draft",
                  seoTitle: `SEO ${index}`,
                };
              }
              return {
                path: `/MINERVOT/durability/${index}.txt`,
                rev: `rev_${index}`,
                ensuredFolder: true,
              };
            },
          );

          // Duplicate pass — must not re-execute side effects.
          const dup = await runIntegrationAction(
            {
              integration,
              action,
              userId: "durability-user",
              idempotencyKey,
              preventDuplicate: true,
              maxAttempts: 4,
            },
            async () => {
              throw new Error("duplicate path must not execute");
            },
          );

          metrics.push({
            integration,
            success: executed.result === "success",
            duplicate: dup.duplicate,
            timeout: false,
            retry: executed.retry,
            durationMs: Date.now() - started,
          });
          expect(dup.duplicate).toBe(true);
        } catch {
          metrics.push({
            integration,
            success: false,
            duplicate: false,
            timeout: shouldTimeout,
            retry: Math.max(0, attempts - 1),
            durationMs: Date.now() - started,
          });
        }
      }

      const services: Array<{ id: string; action: string }> = [
        { id: "x", action: "post" },
        { id: "gmail", action: "send" },
        { id: "google_calendar", action: "create" },
        { id: "wordpress", action: "publish" },
        { id: "dropbox", action: "upload" },
      ];

      for (const service of services) {
        for (let i = 1; i <= PER_SERVICE; i += 1) {
          await runService(service.id, service.action, i);
        }
      }

      // Remainder runs on X if TOTAL_RUNS not divisible by 5.
      const remainder = TOTAL_RUNS - PER_SERVICE * 5;
      for (let i = 1; i <= remainder; i += 1) {
        await runService("x", "post", PER_SERVICE + i);
      }

      // OAuth lifecycle coverage (not counted in 500 action runs).
      recordOAuthLifecycleEvent({
        integration: "x",
        userId: "durability-user",
        phase: "reconnect",
        message: "reauth",
      });
      markOAuthCancelled({
        integration: "dropbox",
        userId: "durability-user",
        clearPending: () => undefined,
      });

      // Retry classifier smoke: 5xx recovers.
      const recovered = await withIntegrationRetry(
        async (attempt) => {
          if (attempt < 2) throw new IntegrationHttpError(503, "unavailable");
          return "ok";
        },
        { maxAttempts: 3, baseDelayMs: 1, sleep: async () => undefined },
      );
      expect(recovered.value).toBe("ok");

      const successCount = metrics.filter((m) => m.success).length;
      const duplicateCount = metrics.filter((m) => m.duplicate).length;
      const timeoutCount = metrics.filter((m) => m.timeout).length;
      const retryCount = metrics.filter((m) => m.retry > 0).length;
      const durations = metrics.map((m) => m.durationMs);
      const avg =
        durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length);
      const p95 = percentile(durations, 0.95);
      const successRate = successCount / metrics.length;
      const duplicateRate = duplicateCount / metrics.length;
      const retryRate = retryCount / metrics.length;
      const timeoutRate = timeoutCount / metrics.length;

      const audit = listIntegrationAuditRecords({ limit: 10_000 });
      const auditSummary = summarizeIntegrationAudit(audit);

      const report = {
        generatedAt: new Date().toISOString(),
        totalRuns: metrics.length,
        perService: PER_SERVICE,
        successCount,
        successRate,
        avgDurationMs: avg,
        p95DurationMs: p95,
        retryRate,
        duplicateRate,
        timeoutRate,
        forced429,
        forcedTimeout,
        auditSummary,
        byIntegration: services.map((service) => {
          const rows = metrics.filter((m) => m.integration === service.id);
          return {
            integration: service.id,
            runs: rows.length,
            successRate:
              rows.filter((r) => r.success).length / Math.max(1, rows.length),
            duplicateRate:
              rows.filter((r) => r.duplicate).length / Math.max(1, rows.length),
            retryRate:
              rows.filter((r) => r.retry > 0).length / Math.max(1, rows.length),
          };
        }),
      };

      const outDir = "/opt/cursor/artifacts";
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, "integration-production-500-report.json");
      writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

      // Production-ready gates
      expect(metrics.length).toBe(TOTAL_RUNS);
      expect(successRate).toBeGreaterThanOrEqual(0.98);
      expect(duplicateRate).toBeGreaterThanOrEqual(0.98);
      expect(timeoutRate).toBeLessThanOrEqual(0.02);
      expect(auditSummary.total).toBeGreaterThanOrEqual(TOTAL_RUNS);
    },
    180_000,
  );
});
