"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { useMotionLite } from "@/components/motion/motion-provider";
import { cn } from "@/lib/design-system/cn";
import {
  MOTION_MS,
  MOTION_REDUCED,
  MOTION_STAGGER_CAP,
  MOTION_TRANSITION,
  MOTION_Y,
} from "@/lib/motion/tokens";

type MotionListProps = {
  children: ReactNode;
  className?: string;
  as?: "ul" | "div";
};

/**
 * Presence root for list add/remove. Keep first paint quiet (`initial={false}`)
 * so it does not stack with PageReveal.
 */
export function MotionList({
  children,
  className,
  as: Tag = "ul",
}: MotionListProps) {
  return (
    <Tag className={className}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </Tag>
  );
}

type MotionListItemProps = {
  children: ReactNode;
  className?: string;
  index?: number;
  as?: "li" | "div";
};

export function MotionListItem({
  children,
  className,
  index,
  as = "li",
}: MotionListItemProps) {
  const reduce = useReducedMotion();
  const lite = useMotionLite();
  const delay =
    typeof index === "number" && index >= 0 && index < MOTION_STAGGER_CAP
      ? (index * MOTION_MS.stagger) / 1000
      : 0;
  const Comp = as === "div" ? motion.div : motion.li;

  return (
    <Comp
      layout={reduce || lite ? false : "position"}
      className={cn(className)}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: MOTION_Y.card }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={
        reduce
          ? MOTION_REDUCED
          : { ...MOTION_TRANSITION.base, delay, layout: MOTION_TRANSITION.base }
      }
    >
      {children}
    </Comp>
  );
}
