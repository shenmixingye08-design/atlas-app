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
  missRate: number;
  firings: Array<{
    index: number;
    scheduledAt: string;
    executedAt: string;
    delayMs: number;
    success: boolean;
  }>;
  averageDelayMs: number;
  p95DelayMs: number;
  p99DelayMs: number;
  maxDelayMs: number;
  verdict: "pass" | "fail";
  generatedAt: string;
  note: string;
};

function artifactDir(): string {
  const dir = "/opt/cursor/artifacts/scheduler-production";
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return dir;
}

export function writeSchedulerHundredProof(
  input: Omit<
    SchedulerHundredProof,
    "generatedAt" | "verdict" | "note" | "missRate"
  > & {
    note?: string;
  },
): SchedulerHundredProof {
  const missRate = (input.total - input.success) / Math.max(1, input.total);
  const report: SchedulerHundredProof = {
    ...input,
    missRate,
    // duplicates = blocked re-fires (good). Fail only on misses/failed.
    verdict:
      input.success === input.total && input.failed === 0 && missRate === 0
        ? "pass"
        : "fail",
    generatedAt: new Date().toISOString(),
    note:
      input.note ??
      "In-process proof via work-queue enqueueDueAutomations (not live Vercel cron). duplicates=blocked re-fires.",
  };
  try {
    writeFileSync(
      join(artifactDir(), "scheduler-100-proof.json"),
      JSON.stringify(report, null, 2),
    );
  } catch {
    // ignore
  }
  return report;
}

export function writeLoadProof(report: Record<string, unknown>): void {
  try {
    const jobs = String(report.jobs ?? "unknown");
    writeFileSync(
      join(artifactDir(), `scheduler-load-${jobs}.json`),
      JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2),
    );
  } catch {
    // ignore
  }
}
