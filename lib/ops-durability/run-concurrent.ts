import type { ConcurrentBatchResult } from "@/lib/ops-durability/types";
import { runOpsJobCase } from "@/lib/ops-durability/run-job";
import type { OpsJobCase } from "@/lib/ops-durability/types";

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx]!;
}

/**
 * Controlled concurrency ramps. Does not hit production.
 */
export async function runConcurrentBatches(input: {
  userId: string;
  baseCases: OpsJobCase[];
  levels?: number[];
}): Promise<ConcurrentBatchResult[]> {
  const levels = input.levels ?? [5, 10, 20, 50, 100];
  const results: ConcurrentBatchResult[] = [];

  for (const concurrency of levels) {
    const slice = input.baseCases.slice(0, concurrency).map((c, i) => ({
      ...c,
      caseId: `ops_c${concurrency}_${c.caseId}_${i}`,
      uniqueToken: `${c.uniqueToken}-C${concurrency}-${i}`,
    }));
    const started = Date.now();
    const memBefore =
      typeof process.memoryUsage === "function"
        ? process.memoryUsage().heapUsed / (1024 * 1024)
        : null;

    const settled = await Promise.all(
      slice.map((c) =>
        runOpsJobCase(c, {
          userId: `${input.userId}_c${concurrency}`,
          openaiAvailable: false,
        })
      )
    );

    const durations = settled.map((r) => r.durationMs).sort((a, b) => a - b);
    const success = settled.filter((r) => r.ok && r.countedInSuccessRate).length;
    const counted = settled.filter((r) => r.countedInSuccessRate).length;
    const timeouts = settled.filter((r) => r.failureClass === "timeout").length;
    const retries = settled.filter((r) => r.retryCount > 0).length;
    const stuck = settled.filter(
      (r) => r.statusFinal === "running" || r.failureClass === "stuck_job"
    ).length;
    const memAfter =
      typeof process.memoryUsage === "function"
        ? process.memoryUsage().heapUsed / (1024 * 1024)
        : null;

    results.push({
      concurrency,
      total: settled.length,
      success,
      successRate: counted > 0 ? success / counted : 0,
      avgMs:
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : Date.now() - started,
      p95Ms: pct(durations, 95),
      p99Ms: pct(durations, 99),
      timeoutRate: settled.length ? timeouts / settled.length : 0,
      retryRate: settled.length ? retries / settled.length : 0,
      stuckCount: stuck,
      memoryMb:
        memBefore != null && memAfter != null ? memAfter - memBefore : null,
    });
  }

  return results;
}
