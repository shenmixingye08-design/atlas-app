import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type ProgressBarProps = {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  indeterminate?: boolean;
  className?: string;
};

const SIZE: Record<NonNullable<ProgressBarProps["size"]>, string> = {
  sm: "h-1",
  md: "h-1.5",
  lg: "h-2",
};

export function ProgressBar({
  value,
  max = 100,
  size = "md",
  showLabel = false,
  indeterminate = false,
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-2 flex justify-between text-caption">
          <span>{ui.progress}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div
        className={cn("overflow-hidden rounded-full bg-[var(--background-subtle)]", SIZE[size])}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {indeterminate ? (
          <div
            className={cn("h-full w-1/3 rounded-full bg-accent/40", SIZE[size])}
            style={{ animation: "progress-indeterminate 1.5s ease-in-out infinite" }}
          />
        ) : (
          <div
            className="h-full rounded-full bg-accent transition-all duration-[var(--motion-slow)]"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
