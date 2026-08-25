"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/design-system/cn";
import { MOTION_REDUCED, MOTION_TRANSITION } from "@/lib/motion/tokens";

type CountBadgeProps = {
  count: number;
  className?: string;
  /** Dot-only unread marker (no numeral). */
  dot?: boolean;
};

export function CountBadge({ count, className, dot = false }: CountBadgeProps) {
  const reduce = useReducedMotion();
  const visible = count > 0;

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.span
          key={dot ? "dot" : count}
          aria-hidden
          className={cn(
            dot
              ? "absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-[var(--card)]"
              : "inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] font-medium text-accent",
            className,
          )}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.tap}
        >
          {dot ? null : count}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
