"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/design-system/cn";
import { MOTION_REDUCED, MOTION_SPRING_SOFT } from "@/lib/motion/tokens";

type MotionSwitchProps = {
  checked: boolean;
  pending?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
};

/**
 * ON/OFF thumb that slides. Label + aria-checked carry meaning without color.
 */
export function MotionSwitch({
  checked,
  pending = false,
  disabled = false,
  onToggle,
  label,
  className,
}: MotionSwitchProps) {
  const reduce = useReducedMotion();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-[44px] items-center gap-3 rounded-full px-1 focus-ring disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-[background-color] duration-[var(--motion-fast)]",
          checked ? "bg-[var(--brand)]" : "bg-[var(--surface-muted)] ring-1 ring-[var(--border)]",
        )}
      >
        <motion.span
          className="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-[var(--surface-raised)] shadow-[var(--shadow-subtle)]"
          animate={{ x: checked ? 20 : 0 }}
          transition={reduce ? MOTION_REDUCED : MOTION_SPRING_SOFT}
        />
      </span>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
}
