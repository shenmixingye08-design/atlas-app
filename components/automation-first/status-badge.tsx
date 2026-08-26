import { StatusMorph, type MotionJobStatus } from "@/components/motion/status-morph";
import {
  RUN_STATUS_LABEL,
  type RunVisualStatus,
} from "@/lib/automation-first/status";

function toMotionStatus(status: RunVisualStatus): MotionJobStatus {
  switch (status) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "pending_approval":
    case "needs_input":
    case "partial":
      return "needs_attention";
    case "paused":
      return "paused";
    default:
      return "queued";
  }
}

export type { RunVisualStatus };

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: RunVisualStatus;
  /** Override default status copy when the API provides a richer label. */
  label?: string;
  className?: string;
}) {
  return (
    <StatusMorph
      status={toMotionStatus(status)}
      label={label?.trim() || RUN_STATUS_LABEL[status]}
      className={className}
    />
  );
}
