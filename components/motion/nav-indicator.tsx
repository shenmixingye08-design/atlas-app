"use client";

import { motion, useReducedMotion } from "motion/react";

import { MOTION_REDUCED, MOTION_TRANSITION } from "@/lib/motion/tokens";

type BottomNavIndicatorProps = {
  index: number;
  count: number;
  hidden?: boolean;
};

/**
 * Sliding selected-tab pill. Uses translateX (own width * index),
 * not left/width, so layout stays fixed.
 */
export function BottomNavIndicator({
  index,
  count,
  hidden = false,
}: BottomNavIndicatorProps) {
  const reduce = useReducedMotion();

  if (hidden || count <= 0 || index < 0 || index >= count) {
    return null;
  }

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-1 bottom-1 rounded-[var(--radius-md)] bg-[var(--brand-muted)]"
      style={{ width: `${100 / count}%` }}
      initial={false}
      animate={{ x: `${index * 100}%` }}
      transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.nav}
    />
  );
}
