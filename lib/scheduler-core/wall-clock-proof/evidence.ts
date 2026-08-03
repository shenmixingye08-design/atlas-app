import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  DelaySummary,
  WallClockEnvironment,
  WallClockOccurrenceRecord,
  WallClockVerdict,
} from "./types";

export function wallClockArtifactDir(): string {
  const dir = "/opt/cursor/artifacts/scheduler-wall-clock-2-4";
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(name: string, value: unknown): string {
  const path = join(wallClockArtifactDir(), name);
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}

export function writeCsv(
  name: string,
  rows: WallClockOccurrenceRecord[],
): string {
  const path = join(wallClockArtifactDir(), name);
  const headers = [
    "testCaseId",
    "scheduleId",
    "automationId",
    "occurrenceId",
    "occurrenceKey",
    "scheduledAt",
    "schedulerDetectedAt",
    "occurrenceCreatedAt",
    "runCreatedAt",
    "jobCreatedAt",
    "outboxCreatedAt",
    "queuedAt",
    "leasedAt",
    "runningAt",
    "completedAt",
    "failedAt",
    "scheduleDelayMs",
    "occurrenceCreationMs",
    "enqueueDelayMs",
    "queueWaitMs",
    "leaseWaitMs",
    "startDelayMs",
    "executionDurationMs",
    "retryCount",
    "duplicateDetected",
    "missedDetected",
    "finalStatus",
    "diagnosticId",
    "cohort",
    "timezone",
    "priority",
    "expectFire",
    "success",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = (row as Record<string, unknown>)[h];
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(","),
    );
  }
  writeFileSync(path, lines.join("\n"));
  return path;
}

export function persistWallClockEvidence(input: {
  environment: WallClockEnvironment;
  records: WallClockOccurrenceRecord[];
  delay: {
    scheduleDelay: DelaySummary;
    queueWait: DelaySummary;
    startDelay: DelaySummary;
  };
  rates: Record<string, number>;
  duplicates: Record<string, unknown>;
  missed: Record<string, unknown>;
  recovery: Record<string, unknown>;
  alerts: Record<string, unknown>;
  dashboard: Record<string, unknown>;
  previewProbe: Record<string, unknown>;
  cohortBreakdown: Record<string, unknown>;
  verdict: WallClockVerdict;
  acceptance: Record<string, unknown>;
  wallClockHundredProven: "YES" | "NO";
  scheduleTrustworthy: "YES" | "NO";
  rationale: string[];
}): {
  proofPath: string;
  csvPath: string;
  delayPath: string;
  duplicatePath: string;
  missedPath: string;
  recoveryPath: string;
} {
  const proofPath = writeJson("scheduler-wall-clock-proof.json", {
    phase: "2-4",
    ...input,
    generatedAt: new Date().toISOString(),
  });
  const csvPath = writeCsv("scheduler-100-occurrences.csv", input.records);
  const delayPath = writeJson("scheduler-delay-summary.json", {
    commitSha: input.environment.commitSha,
    environment: input.environment.classification,
    ...input.delay,
    rates: input.rates,
  });
  const duplicatePath = writeJson(
    "scheduler-duplicate-report.json",
    input.duplicates,
  );
  const missedPath = writeJson("scheduler-missed-report.json", input.missed);
  const recoveryPath = writeJson(
    "scheduler-recovery-report.json",
    input.recovery,
  );
  writeJson("scheduler-alert-report.json", input.alerts);
  writeJson("scheduler-dashboard-snapshot.json", input.dashboard);
  writeJson("scheduler-preview-probe.json", input.previewProbe);
  writeJson("scheduler-cohort-breakdown.json", input.cohortBreakdown);
  writeJson("scheduler-acceptance.json", input.acceptance);
  return {
    proofPath,
    csvPath,
    delayPath,
    duplicatePath,
    missedPath,
    recoveryPath,
  };
}
