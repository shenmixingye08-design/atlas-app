"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/design-system/cn";
import {
  MOTION_REDUCED,
  MOTION_SCALE,
  MOTION_TRANSITION,
} from "@/lib/motion/tokens";

type PressableProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  card?: boolean;
};

/**
 * Tap scale for already-interactive children (Link, button).
 * Does not change click handlers — pointer events pass through to children.
 */
export function Pressable({
  children,
  className,
  disabled = false,
  card = false,
}: PressableProps) {
  const reduce = useReducedMotion();
  const scale = card ? MOTION_SCALE.tapCard : MOTION_SCALE.tap;

  return (
    <motion.div
      className={cn(className)}
      whileTap={disabled || reduce ? undefined : { scale }}
      transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.tap}
    >
      {children}
    </motion.div>
  );
}
