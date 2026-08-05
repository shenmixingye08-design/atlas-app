/**
 * P09 staged concurrency load gate (100 → 300 → 500 → 1000).
 *
 * Measures (no ATLAS_MOCK_LLM):
 * - Concurrent Word / Excel / PDF / PowerPoint generation (pooled)
 * - Concurrent notification create + history read
 * - Concurrent withRetry recovery (API/Storage/DB/Timeout class errors)
 * - Duplicate idempotency on notifications
 *
 * NOT covered live (secrets missing): Clerk login, Stripe, real OpenAI, Supabase RPC claim.
 * Writes report under /opt/cursor/artifacts/p09-scalability/
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetDeliverableMemoryStoreForTests } from "@/lib/deliverables/store";
import { resetDurableInboxForTests } from "@/lib/notifications/durable-inbox";
import {
  createNotification,
  listUserNotifications,
} from "@/lib/notifications/service";
import { resetNotificationStore } from "@/lib/notifications/store";
import { withRetry } from "@/lib/reliability/retry";

const STAGES = (process.env.P09_STAGES ?? "100,300,500,1000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

/** Cap true parallel generators to protect the runner from OOM. */
const GEN_POOL = Number(process.env.P09_GEN_POOL ?? 40);
const OUT =
  process.env.P09_REPORT_DIR ?? "/opt/cursor/artifacts/p09-scalability";

const FORMATS = ["docx", "xlsx", "pdf", "pptx"] as const;
type Format = (typeof FORMATS)[number];

const BODY = `# P09負荷試験

日本語の実データです。同時生成でも壊れないことを確認します。
売上 128 万円、件数 42 件。
`.repeat(8);

type StageResult = {
  stage: number;
  ok: boolean;
  durationMs: number;
  generate: {
    attempted: number;
    success: number;
    failure: number;
    successRate: number;
    p50Ms: number | null;
    p95Ms: number | null;
    byFormat: Record<Format, { ok: number; fail: number }>;
  };
  notify: {
    attempted: number;
    success: number;
    failure: number;
    successRate: number;
    duplicates: number;
  };
  retry: {
    attempted: number;
    success: number;
    failure: number;
    successRate: number;
  };
  historyOk: boolean;
  reasons: string[];
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function generateOne(format: Format, i: number) {
  const started = Date.now();
  const base = `p09_${format}_${i}`;
  let file;
  switch (format) {
    case "docx":
      file = await new DocxDeliverableGenerator().generate(BODY, base);
      break;
    case "xlsx":
      file = await new XlsxDeliverableGenerator().generate(BODY, base);
      break;
    case "pdf":
      file = await new PdfDeliverableGenerator().generate(BODY, base);
      break;
    case "pptx":
      file = await new PptxDeliverableGenerator().generate(BODY, base);
      break;
  }
  const verify = await verifyGeneratedExportAsync(file);
  return {
    ok: verify.ok && file.buffer.byteLength > 200,
    format,
    durationMs: Date.now() - started,
    bytes: file.buffer.byteLength,
    reasons: verify.ok ? [] : verify.reasons,
  };
}

async function runStage(stage: number): Promise<StageResult> {
  const started = Date.now();
  const reasons: string[] = [];
  const userId = `p09_user_${stage}`;

  resetDeliverableMemoryStoreForTests();
  resetDurableDeliverableStoreForTests();
  resetNotificationStore();
  resetDurableInboxForTests();

  vi.stubEnv("ATLAS_NOTIFICATION_STORAGE", "memory_durable");
  vi.stubEnv("ATLAS_DELIVERABLE_STORAGE", "memory_durable");
  vi.stubEnv("NODE_ENV", "test");

  // Mix formats across N concurrent logical users.
  const jobs = Array.from({ length: stage }, (_, i) => FORMATS[i % 4]!);
  const genResults = await mapPool(jobs, GEN_POOL, (format, i) =>
    generateOne(format, i).catch((error) => ({
      ok: false as const,
      format,
      durationMs: 0,
      bytes: 0,
      reasons: [error instanceof Error ? error.message : String(error)],
    })),
  );

  const byFormat = {
    docx: { ok: 0, fail: 0 },
    xlsx: { ok: 0, fail: 0 },
    pdf: { ok: 0, fail: 0 },
    pptx: { ok: 0, fail: 0 },
  };
  const durations: number[] = [];
  let genOk = 0;
  for (const r of genResults) {
    if (r.ok) {
      genOk += 1;
      byFormat[r.format].ok += 1;
      durations.push(r.durationMs);
    } else {
      byFormat[r.format].fail += 1;
      reasons.push(`${r.format}:${r.reasons.join(",") || "fail"}`);
    }
  }
  durations.sort((a, b) => a - b);

  // Concurrent notifications with stable idempotency keys (no duplicates).
  const notifyResults = await mapPool(
    Array.from({ length: stage }, (_, i) => i),
    Math.min(GEN_POOL, 80),
    async (i) => {
      const idem = `p09_ntf_${stage}_${i}`;
      const a = await createNotification(
        {
          audience: "user",
          userId,
          type: "completed",
          title: "完了",
          message: `負荷試験 #${i}`,
          requestId: idem,
        },
        { skipDelivery: true },
      );
      // Second insert with same requestId should not create a second row.
      const b = await createNotification(
        {
          audience: "user",
          userId,
          type: "completed",
          title: "完了",
          message: `負荷試験 #${i} retry`,
          requestId: idem,
        },
        { skipDelivery: true },
      );
      return {
        ok: Boolean(a?.notificationId),
        sameId:
          Boolean(a?.notificationId) &&
          Boolean(b?.notificationId) &&
          a!.notificationId === b!.notificationId,
      };
    },
  );

  const notifyOk = notifyResults.filter((r) => r.ok).length;
  const history = await listUserNotifications(userId);
  // Idempotent creates should not yield 2× stage rows.
  const duplicates = Math.max(0, history.length - stage);
  const historyOk = history.length > 0 && history.length <= stage + 5;

  // Concurrent retry recovery for classified failures.
  const retryResults = await mapPool(
    Array.from({ length: stage }, (_, i) => i),
    Math.min(GEN_POOL, 100),
    async (i) => {
      const kind = i % 4;
      let attempts = 0;
      try {
        await withRetry(
          async () => {
            attempts += 1;
            if (attempts < 2) {
              if (kind === 0) throw new Error("OpenAI 503 Service Unavailable");
              if (kind === 1) throw new Error("storage_upload_failed");
              if (kind === 2) throw new Error("supabase database upsert failed");
              throw new Error("ETIMEDOUT request timeout");
            }
            return true;
          },
          { maxAttempts: 3, backoffMs: [1, 1, 1] },
        );
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
  );
  const retryOk = retryResults.filter((r) => r.ok).length;

  const generateRate = genOk / stage;
  const notifyRate = notifyOk / stage;
  const retryRate = retryOk / stage;
  const ok =
    generateRate >= 0.95 &&
    notifyRate >= 0.95 &&
    retryRate >= 0.95 &&
    historyOk &&
    duplicates === 0;

  if (generateRate < 0.95) reasons.push(`generate_rate=${generateRate}`);
  if (notifyRate < 0.95) reasons.push(`notify_rate=${notifyRate}`);
  if (retryRate < 0.95) reasons.push(`retry_rate=${retryRate}`);
  if (!historyOk) reasons.push(`history_len=${history.length}`);
  if (duplicates > 0) reasons.push(`notify_duplicates=${duplicates}`);

  return {
    stage,
    ok,
    durationMs: Date.now() - started,
    generate: {
      attempted: stage,
      success: genOk,
      failure: stage - genOk,
      successRate: generateRate,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      byFormat,
    },
    notify: {
      attempted: stage,
      success: notifyOk,
      failure: stage - notifyOk,
      successRate: notifyRate,
      duplicates,
    },
    retry: {
      attempted: stage,
      success: retryOk,
      failure: stage - retryOk,
      successRate: retryRate,
    },
    historyOk,
    reasons: reasons.slice(0, 30),
  };
}

describe.skipIf(process.env.P09_RUN !== "1")("P09 scalability staged concurrency", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    expect(process.env.ATLAS_MOCK_LLM).not.toBe("true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it(
    `runs stages ${STAGES.join("→")} and writes capacity report`,
    async () => {
      mkdirSync(OUT, { recursive: true });
      const stages: StageResult[] = [];
      for (const stage of STAGES) {
        console.log(`[p09] starting stage=${stage} pool=${GEN_POOL}`);
        const result = await runStage(stage);
        stages.push(result);
        console.log(
          `[p09] stage=${stage} ok=${result.ok} gen=${result.generate.successRate} notify=${result.notify.successRate} ms=${result.durationMs}`,
        );
        // Stop escalating if a stage collapses — still record report.
        if (!result.ok) break;
      }

      const maxPass = [...stages].reverse().find((s) => s.ok)?.stage ?? 0;
      const bottlenecks = [
        "User work-jobs are blob+memory claim (not SKIP LOCKED) — multi-instance double-run risk",
        "Notification GET historically listed inbox multiple times per 8s poll (mitigated in P09)",
        "Process-local rate limits / circuits do not aggregate across serverless instances",
        "OpenAI path previously maxRetries:0 (mitigated toward SDK retries in P09)",
        "Live Clerk/Stripe/Supabase claim concurrency not measured in this environment (no secrets)",
      ];

      const report = {
        phase: "P09",
        measuredAt: new Date().toISOString(),
        stages,
        maxConcurrentPass: maxPass,
        genPool: GEN_POOL,
        gatePass: maxPass >= 1000 && stages.every((s) => s.ok),
        bottlenecks,
        evidenceNote:
          "Local/memory_durable concurrency for generate+notify+retry. Not live Clerk login or paid OpenAI fan-out.",
      };

      writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
      writeFileSync(
        join(OUT, "report.md"),
        `# P09 Scalability Report

- Measured: ${report.measuredAt}
- Stages: ${STAGES.join(", ")}
- Max concurrent pass: **${maxPass}**
- Gate (≥1000 all green): ${report.gatePass}

## Stages

${stages
  .map(
    (s) =>
      `### N=${s.stage} — ${s.ok ? "PASS" : "FAIL"} (${s.durationMs} ms)
- Generate success: ${(s.generate.successRate * 100).toFixed(1)}% (p50=${s.generate.p50Ms} p95=${s.generate.p95Ms})
- Notify success: ${(s.notify.successRate * 100).toFixed(1)}% duplicates=${s.notify.duplicates}
- Retry success: ${(s.retry.successRate * 100).toFixed(1)}%
- Formats: ${JSON.stringify(s.generate.byFormat)}
`,
  )
  .join("\n")}

## Bottlenecks

${bottlenecks.map((b) => `- ${b}`).join("\n")}
`,
      );

      expect(maxPass, JSON.stringify(stages.map((s) => ({ stage: s.stage, ok: s.ok, reasons: s.reasons })), null, 2)).toBeGreaterThanOrEqual(100);
      // Prefer full 1000 pass; if runner OOMs mid-way, still ship evidence.
      if (STAGES.includes(1000)) {
        expect(report.gatePass, JSON.stringify(stages.at(-1)?.reasons)).toBe(
          true,
        );
      }
    },
    // 1000 × PDF can be long even pooled.
    60 * 60 * 1000,
  );
});
