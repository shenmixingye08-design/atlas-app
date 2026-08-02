import { cn } from "@/lib/design-system/cn";
import {
  RUN_STATUS_LABEL,
  statusBadgeClass,
  type RunVisualStatus,
} from "@/lib/automation-first/status";

export type { RunVisualStatus };

export function StatusBadge({
  status,
  className,
}: {
  status: RunVisualStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full px-2.5 text-[length:var(--text-caption)] font-medium",
        statusBadgeClass(status),
        className,
      )}
    >
      {RUN_STATUS_LABEL[status]}
    </span>
  );
}
