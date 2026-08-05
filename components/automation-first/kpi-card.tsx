import { cn } from "@/lib/design-system/cn";

export type KpiCardProps = {
  label: string;
  description: string;
  value: number;
  unit?: string;
  emphasize?: boolean;
  emptyHint?: string;
  className?: string;
};

/**
 * Descriptive KPI tile — never ends on a bare number.
 */
export function KpiCard({
  label,
  description,
  value,
  unit = "件",
  emphasize,
  emptyHint,
  className,
}: KpiCardProps) {
  const showEmptyHint = value === 0 && Boolean(emptyHint);

  return (
    <div
      className={cn(
        "af-card flex min-h-[7.5rem] flex-col gap-2 p-4",
        emphasize &&
          "border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-[var(--warning-bg)]",
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-[length:var(--text-label)] font-semibold text-[var(--text-secondary)]">
          {label}
        </p>
        <p className="text-[length:var(--text-caption)] leading-snug text-[var(--text-muted)]">
          {description}
        </p>
      </div>
      <p className="mt-auto text-[length:var(--text-numeric)] font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
        <span className="ml-1 text-[length:var(--text-label)] font-medium text-[var(--text-muted)]">
          {unit}
        </span>
      </p>
      {showEmptyHint ? (
        <p className="text-[length:var(--text-caption)] leading-snug text-[var(--text-muted)]">
          {emptyHint}
        </p>
      ) : null}
    </div>
  );
}
