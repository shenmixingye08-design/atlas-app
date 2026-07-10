import { cn } from "@/lib/design-system/cn";

export type StatusVariant =
  | "waiting"
  | "running"
  | "completed"
  | "error"
  | "warning"
  | "info";

type StatusChipProps = {
  status: StatusVariant;
  label?: string;
  showDot?: boolean;
  className?: string;
};

const CONFIG: Record<
  StatusVariant,
  { label: string; classes: string; dotClass: string }
> = {
  waiting: {
    label: "待機中",
    classes: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral)] ring-[var(--status-neutral)]/25",
    dotClass: "bg-[var(--status-neutral)]",
  },
  running: {
    label: "実行中",
    classes: "bg-[var(--status-info-bg)] text-[var(--status-info)] ring-[var(--status-info)]/30",
    dotClass: "bg-[var(--status-info)] animate-status-pulse",
  },
  completed: {
    label: "完了",
    classes: "bg-[var(--status-success-bg)] text-[var(--status-success)] ring-[var(--status-success)]/30",
    dotClass: "bg-[var(--status-success)]",
  },
  error: {
    label: "エラー",
    classes: "bg-[var(--status-error-bg)] text-[var(--status-error)] ring-[var(--status-error)]/30",
    dotClass: "bg-[var(--status-error)]",
  },
  warning: {
    label: "警告",
    classes: "bg-[var(--status-warning-bg)] text-[var(--status-warning)] ring-[var(--status-warning)]/30",
    dotClass: "bg-[var(--status-warning)]",
  },
  info: {
    label: "情報",
    classes: "bg-[var(--status-info-bg)] text-[var(--status-info)] ring-[var(--status-info)]/30",
    dotClass: "bg-[var(--status-info)]",
  },
};

export function StatusChip({
  status,
  label,
  showDot = true,
  className,
}: StatusChipProps) {
  const config = CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        config.classes,
        className,
      )}
    >
      {showDot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", config.dotClass)}
          aria-hidden="true"
        />
      )}
      {label ?? config.label}
    </span>
  );
}
