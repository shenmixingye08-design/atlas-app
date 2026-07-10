import type { OrchestrationResult } from "@/lib/orchestration/types";
import { resolveAssignedEmployee } from "@/lib/employees/registry";
import { getDepartmentLabel } from "@/lib/i18n";

import { getEmployeeDisplayMeta } from "./employee-map";
import type { EmployeeTeamStat, EmployeeTeamStatsSnapshot } from "./types";

type TelemetryRecord = {
  employeeId: string;
  durationMs: number;
  success: boolean;
  recordedAt: string;
};

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __atlasEmployeeTeamTelemetry?: TelemetryRecord[];
  };
}

function getBucket(): TelemetryRecord[] {
  const scope = getGlobalScope();
  if (!scope.__atlasEmployeeTeamTelemetry) {
    scope.__atlasEmployeeTeamTelemetry = [];
  }
  return scope.__atlasEmployeeTeamTelemetry;
}

export function recordEmployeeTeamTelemetry(result: OrchestrationResult): void {
  const bucket = getBucket();
  const timestamp = new Date().toISOString();
  const success = result.status !== "failed" && result.approved;

  for (const execution of result.executions) {
    bucket.push({
      employeeId: execution.assignedEmployeeId,
      durationMs: execution.worker?.durationMs ?? 0,
      success: success && execution.workerStatus !== "failed",
      recordedAt: timestamp,
    });
  }

  if (result.plannerPlan) {
    bucket.push({
      employeeId: "planning-lead-planner",
      durationMs: result.plannerPlan.durationMs,
      success,
      recordedAt: timestamp,
    });
  }

  if (bucket.length > 5000) {
    bucket.splice(0, bucket.length - 5000);
  }
}

export function getEmployeeTeamStatsSnapshot(): EmployeeTeamStatsSnapshot {
  const bucket = getBucket();
  const byEmployee = new Map<
    string,
    { durations: number[]; success: number; failed: number }
  >();

  for (const record of bucket) {
    const current = byEmployee.get(record.employeeId) ?? {
      durations: [],
      success: 0,
      failed: 0,
    };
    current.durations.push(record.durationMs);
    if (record.success) current.success += 1;
    else current.failed += 1;
    byEmployee.set(record.employeeId, current);
  }

  const employees: EmployeeTeamStat[] = [...byEmployee.entries()].map(
    ([employeeId, stats]) => {
      const meta = getEmployeeDisplayMeta(employeeId as Parameters<typeof getEmployeeDisplayMeta>[0]);
      const assignedCount = stats.success + stats.failed;
      const avgDurationMs =
        stats.durations.length > 0
          ? Math.round(
              stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length,
            )
          : 0;

      return {
        employeeId,
        employeeName: meta.name,
        departmentLabel: getDepartmentLabel(meta.departmentId) ?? meta.departmentLabel,
        assignedCount,
        completedCount: stats.success,
        failedCount: stats.failed,
        avgDurationMs,
        successRate: assignedCount > 0 ? stats.success / assignedCount : 0,
        failureRate: assignedCount > 0 ? stats.failed / assignedCount : 0,
      };
    },
  );

  employees.sort((a, b) => b.assignedCount - a.assignedCount);

  return {
    employees,
    totalRuns: bucket.length,
    generatedAt: new Date().toISOString(),
  };
}

export function seedDemoEmployeeStats(): void {
  const bucket = getBucket();
  if (bucket.length > 0) return;

  const demoEmployees = [
    "planning-lead-planner",
    "development-senior-dev",
    "marketing-content-lead",
    "qa-quality-lead",
  ] as const;

  for (const employeeId of demoEmployees) {
    for (let i = 0; i < 8; i++) {
      bucket.push({
        employeeId,
        durationMs: 3000 + i * 500,
        success: i !== 2,
        recordedAt: new Date().toISOString(),
      });
    }
  }
}
