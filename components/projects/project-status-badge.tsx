import type { ProjectStatus } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { StatusChip, type StatusVariant } from "@/components/ui/status-chip";

const STATUS_MAP: Record<
  ProjectStatus,
  { label: string; variant: StatusVariant }
> = {
  pending: { label: ui.project.status.pending, variant: "waiting" },
  running: { label: ui.project.status.running, variant: "running" },
  review: { label: ui.project.status.review, variant: "warning" },
  completed: { label: ui.project.status.completed, variant: "completed" },
};

type ProjectStatusBadgeProps = {
  status: ProjectStatus;
};

export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  const config = STATUS_MAP[status];
  return <StatusChip status={config.variant} label={config.label} showDot />;
}
