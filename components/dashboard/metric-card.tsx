import { cn } from "@/lib/design-system/cn";
import type { DashboardMetric, TrendDirection } from "@/lib/dashboard/types";
import { Card } from "@/components/ui/card";

type MetricCardProps = {
  metric: DashboardMetric;
  className?: string;
  style?: React.CSSProperties;
};

const TREND_STYLES: Record<TrendDirection, string> = {
  up: "text-[var(--status-success)]",
  down: "text-[var(--status-warning)]",
  neutral: "text-[var(--foreground-subtle)]",
};

const TREND_ARROW: Record<TrendDirection, string> = {
  up: "↑",
  down: "↓",
  neutral: "→",
};

export function MetricCard({ metric, className, style }: MetricCardProps) {
  return (
    <Card
      variant="elevated"
      padding="md"
      style={style}
      className={cn(
        "group animate-fade-up transition-all duration-[var(--motion-base)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-lg",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-overline truncate">{metric.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground tabular-nums sm:text-4xl">
            {metric.value}
          </p>
          <p className="mt-2 text-caption">{metric.subtitle}</p>
          <p
            className={cn(
              "mt-2 text-xs font-medium",
              TREND_STYLES[metric.trend],
            )}
          >
            <span aria-hidden="true">{TREND_ARROW[metric.trend]} </span>
            {metric.trendLabel}
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--surface-muted)] text-xl ring-1 ring-[var(--border)] transition-transform duration-[var(--motion-base)] group-hover:scale-105">
          {metric.icon}
        </div>
      </div>
    </Card>
  );
}
