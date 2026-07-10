import type { DashboardMetric } from "@/lib/dashboard/types";
import { ui } from "@/lib/i18n";
import { MetricCard } from "./metric-card";

type DashboardMetricsProps = {
  metrics: DashboardMetric[];
};

export function DashboardMetrics({ metrics }: DashboardMetricsProps) {
  return (
    <section aria-labelledby="dashboard-metrics-heading">
      <h2 id="dashboard-metrics-heading" className="sr-only">
        {ui.dashboard.topMetrics}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {metrics.map((metric, index) => (
          <MetricCard
            key={metric.id}
            metric={metric}
            className={index >= 4 ? "xl:col-span-1" : undefined}
            style={{ animationDelay: `${index * 40}ms` } as React.CSSProperties}
          />
        ))}
      </div>
    </section>
  );
}
