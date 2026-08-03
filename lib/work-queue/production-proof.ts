/**
 * Persist Scheduler 100-run proof + load summaries for submission artifacts.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type SchedulerHundredProof = {
  scenario: string;
  total: number;
  success: number;
  failed: number;
  duplicates: number;
  /** 取りこぼし件数 */
  misses: number;
  successRate: number;
  failureRate: number;
  missRate: number;
  /** 平均実行時間（drain完了までの実測 ms） */
  averageExecutionTimeMs: number;
  averageDelayMs: number;
  p95DelayMs: number;
  p99DelayMs: number;
  maxDelayMs: number;
  firings: Array<{
    index: number;
    scheduledAt: string;
    executedAt: string;
    delayMs: number;
    executionTimeMs: number;
    success: boolean;
    status: "completed" | "failed" | "missed";
  }>;
  storeKind: "file" | "postgres" | "mixed";
  durableLogs: boolean;
  presetsCovered: string[];
  verdict: "pass" | "fail";
  generatedAt: string;
  note: string;
};

function artifactDirs(): string[] {
  const dirs = [
    "/opt/cursor/artifacts/scheduler-production",
    join(process.cwd(), "artifacts/scheduler-production"),
  ];
  for (const dir of dirs) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
  return dirs;
}

export function writeSchedulerHundredProof(
  input: Omit<
    SchedulerHundredProof,
    | "generatedAt"
    | "verdict"
    | "note"
    | "missRate"
    | "successRate"
    | "failureRate"
    | "misses"
  > & {
    misses?: number;
    note?: string;
  },
): SchedulerHundredProof {
  const misses =
    input.misses ?? Math.max(0, input.total - input.success - input.failed);
  const missRate = misses / Math.max(1, input.total);
  const successRate = input.success / Math.max(1, input.total);
  const failureRate = input.failed / Math.max(1, input.total);
  const report: SchedulerHundredProof = {
    ...input,
    misses,
    missRate,
    successRate,
    failureRate,
    // duplicates = blocked re-fires (good). Fail on misses/failed or success < 100%.
    verdict:
      input.success === input.total &&
      input.failed === 0 &&
      misses === 0 &&
      successRate === 1
        ? "pass"
        : "fail",
    generatedAt: new Date().toISOString(),
    note:
      input.note ??
      "100 consecutive enqueue→lease→execute→complete against durable store. duplicates=blocked re-fires.",
  };
  const payload = JSON.stringify(report, null, 2);
  for (const dir of artifactDirs()) {
    try {
      writeFileSync(join(dir, "scheduler-100-proof.json"), payload);
    } catch {
      // ignore
    }
  }
  return report;
}

export function writeLoadProof(report: Record<string, unknown>): void {
  for (const dir of artifactDirs()) {
    try {
      const jobs = String(report.jobs ?? "unknown");
      writeFileSync(
        join(dir, `scheduler-load-${jobs}.json`),
        JSON.stringify(
          { ...report, generatedAt: new Date().toISOString() },
          null,
          2,
        ),
      );
    } catch {
      // ignore
    }
  }
}
