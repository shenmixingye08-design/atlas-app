"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/design-system/cn";
import { MOTION_REDUCED, MOTION_TRANSITION } from "@/lib/motion/tokens";

export type MotionJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "needs_attention"
  | "paused";

const STATUS_COPY: Record<
  MotionJobStatus,
  { label: string; mark: string; tone: string }
> = {
  queued: {
    label: "待機中",
    mark: "○",
    tone: "text-[var(--text-secondary)] bg-[var(--surface-muted)]",
  },
  running: {
    label: "実行中",
    mark: "●",
    tone: "text-[var(--status-running)] bg-[var(--status-running-bg)]",
  },
  completed: {
    label: "完了",
    mark: "✓",
    tone: "text-[var(--status-completed)] bg-[var(--status-completed-bg)]",
  },
  failed: {
    label: "失敗",
    mark: "✕",
    tone: "text-[var(--status-failed)] bg-[var(--status-failed-bg)]",
  },
  needs_attention: {
    label: "要確認",
    mark: "!",
    tone: "text-[var(--status-pending-approval)] bg-[var(--status-pending-approval-bg)]",
  },
  paused: {
    label: "停止中",
    mark: "❚❚",
    tone: "text-[var(--status-paused)] bg-[var(--status-paused-bg)]",
  },
};

type StatusMorphProps = {
  status: MotionJobStatus;
  label?: string;
  className?: string;
};

/**
 * Status change is mark + label, not color alone.
 * Presence crossfades the pair; running uses a quiet pulse on the mark.
 */
export function StatusMorph({ status, label, className }: StatusMorphProps) {
  const reduce = useReducedMotion();
  const config = STATUS_COPY[status];

  return (
    <span
      className={cn(
        "motion-status inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 text-[length:var(--text-caption)] font-medium",
        config.tone,
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={status}
          className="inline-flex items-center gap-1.5"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
          transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.base}
        >
          <span
            aria-hidden
            className={cn(
              "inline-flex w-3 justify-center text-[10px] leading-none",
              status === "running" && "animate-status-pulse",
            )}
          >
            {config.mark}
          </span>
          <span>{label ?? config.label}</span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function mapPhaseToMotionStatus(
  status: "queued" | "running" | "done" | "failed" | string,
): MotionJobStatus {
  if (status === "running") return "running";
  if (status === "done" || status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "queued";
}
