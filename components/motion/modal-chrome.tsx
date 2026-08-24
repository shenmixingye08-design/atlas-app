"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/design-system/cn";
import {
  MOTION_REDUCED,
  MOTION_TRANSITION,
  MOTION_Y,
} from "@/lib/motion/tokens";

type ModalChromeProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
  /** sheet: rise from the bottom on mobile; center: short fade+lift */
  placement?: "sheet" | "center";
};

/**
 * Presence + panel motion only. Callers keep their own dialog role,
 * focus, Escape, and close handlers.
 */
export function ModalChrome({
  open,
  children,
  className,
  placement = "sheet",
}: ModalChromeProps) {
  const reduce = useReducedMotion();
  const fromY = placement === "sheet" ? MOTION_Y.modal : MOTION_Y.page;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={cn(className)}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: fromY }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: fromY * 0.7 }}
          transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.modal}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

type ModalBackdropProps = {
  open: boolean;
  className?: string;
  children?: ReactNode;
};

export function ModalBackdrop({
  open,
  className,
  children,
}: ModalBackdropProps) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={cn(className)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.backdrop}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
