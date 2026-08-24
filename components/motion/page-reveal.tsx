"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/design-system/cn";
import { MOTION_REDUCED, MOTION_TRANSITION, MOTION_Y } from "@/lib/motion/tokens";

type PageRevealProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Enter animation for the main content area.
 * Transform does not affect layout, so this does not cause CLS.
 * Re-renders of the same mounted instance do not replay the animation.
 */
export function PageReveal({ children, className }: PageRevealProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={cn("min-w-0", className)}
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: MOTION_Y.page }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.page}
    >
      {children}
    </motion.div>
  );
}
