"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, type ReactNode } from "react";

import { cn } from "@/lib/design-system/cn";
import {
  MOTION_REDUCED,
  MOTION_SCALE,
  MOTION_TRANSITION,
  MOTION_Y,
} from "@/lib/motion/tokens";

let scrollLockCount = 0;
let previousOverflow = "";
let previousPadding = "";

function lockBodyScroll() {
  if (typeof document === "undefined") return () => {};
  const body = document.body;
  if (scrollLockCount === 0) {
    previousOverflow = body.style.overflow;
    previousPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
  }
  scrollLockCount += 1;
  return () => {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    }
  };
}

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
          initial={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, y: fromY, scale: MOTION_SCALE.modal }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, y: fromY * 0.7, scale: MOTION_SCALE.modal }
          }
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

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={cn("motion-modal-backdrop", className)}
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
