"use client";

import type { EmployeeTeamStatsSnapshot } from "@/lib/team-collaboration";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

type EmployeeTeamStatsPanelProps = {
  snapshot: EmployeeTeamStatsSnapshot;
};

export function EmployeeTeamStatsPanel({ snapshot }: EmployeeTeamStatsPanelProps) {
  if (snapshot.employees.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.teamCollaboration.emptyStats}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-caption text-[var(--foreground-muted)]">
        {ui.owner.generatedAt(
          new Date(snapshot.generatedAt).toLocaleString("ja-JP"),
        )}
      </p>

      <div className="overflow-x-auto rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-left">
              <th className="px-4 py-3 font-semibold text-foreground">担当</th>
              <th className="px-4 py-3 font-semibold text-foreground">部門</th>
              <th className="px-4 py-3 font-semibold text-foreground">
                {ui.teamCollaboration.statAssigned}
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">
                {ui.teamCollaboration.statCompleted}
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">
                {ui.teamCollaboration.statAvgTime}
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">
                {ui.teamCollaboration.statSuccess}
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">
                {ui.teamCollaboration.statFailure}
              </th>
            </tr>
          </thead>
          <tbody>
            {snapshot.employees.map((row) => (
              <tr
                key={row.employeeId}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="px-4 py-3 font-medium text-foreground">{row.employeeName}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{row.departmentLabel}</td>
                <td className="px-4 py-3 tabular-nums">{row.assignedCount}</td>
                <td className="px-4 py-3 tabular-nums">{row.completedCount}</td>
                <td className="px-4 py-3 tabular-nums">
                  {ui.teamCollaboration.avgTimeValue(row.avgDurationMs)}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--success)]">
                  {ui.teamCollaboration.successRateValue(row.successRate)}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--status-error)]">
                  {ui.teamCollaboration.successRateValue(row.failureRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
