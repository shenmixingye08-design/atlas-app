"use client";

import { useMemo } from "react";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { findEmployeeById } from "@/lib/employees/registry";
import {
  generateCompanyOperationsReport,
  type HealthStatus,
} from "@/lib/operations";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

type CompanyOperationsPanelProps = {
  result: OrchestrationResult;
};

const HEALTH_LABELS: Record<HealthStatus, string> = {
  excellent: ui.ops.healthExcellent,
  good: ui.ops.healthGood,
  attention: ui.ops.healthAttention,
};

export function CompanyOperationsPanel({ result }: CompanyOperationsPanelProps) {
  const report = useMemo(
    () => generateCompanyOperationsReport(result),
    [result],
  );

  if (!report) {
    return null;
  }

  const ceo = findEmployeeById("ceo-office-atlas-ceo");

  return (
    <section
      className="space-y-4 animate-comm-in"
      aria-labelledby="company-ops-heading"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--background-subtle)] text-lg"
          aria-hidden="true"
        >
          {ceo?.avatar ?? "👔"}
        </span>
        <div>
          <h2 id="company-ops-heading" className="text-title text-foreground">
            {ui.ops.sectionTitle}
          </h2>
          <p className="text-caption">
            {ceo?.name ?? ui.ops.deptCeo} · {ui.ops.planningOnly}
          </p>
        </div>
      </div>

      <Card padding="lg">
        <div className="space-y-12">
          <div>
            <p className="text-overline">{ui.ops.todayStatusTitle}</p>
            <ul className="mt-4 space-y-2">
              {report.todayStatus.map((line) => (
                <li
                  key={line}
                  className="text-sm leading-relaxed text-[var(--foreground-muted)]"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-overline">{ui.ops.departmentHighlightsTitle}</p>
            <dl className="mt-4 space-y-4">
              {report.departmentHighlights.map((dept) => (
                <div key={dept.id} className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                  <dt className="text-sm font-medium text-foreground">
                    {dept.label}
                  </dt>
                  <dd className="text-sm text-[var(--foreground-muted)]">
                    {dept.highlight}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <p className="text-overline">{ui.ops.healthTitle}</p>
            <ul className="mt-4 space-y-3">
              {report.health.map((indicator) => (
                <li
                  key={indicator.id}
                  className="flex items-center justify-between gap-6 text-sm"
                >
                  <span className="text-[var(--foreground-muted)]">
                    {indicator.label}
                  </span>
                  <span className="font-medium text-foreground">
                    {HEALTH_LABELS[indicator.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-[var(--border)] pt-10">
            <p className="text-overline">{ui.ops.ceoReportTitle}</p>
            <p className="mt-4 text-sm leading-relaxed text-foreground">
              {report.ceoDailyReport}
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}
