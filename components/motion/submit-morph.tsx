"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/design-system/cn";
import { MOTION_REDUCED, MOTION_SCALE, MOTION_TRANSITION } from "@/lib/motion/tokens";

export type SubmitPhase = "idle" | "processing" | "accepted";

type SubmitMorphProps = {
  phase: SubmitPhase;
  children: ReactNode;
  processingLabel?: ReactNode;
  acceptedLabel?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
};

/**
 * Press → processing → accepted morph.
 * Accepted means the request was received — not that the job finished.
 */
export function SubmitMorph({
  phase,
  children,
  processingLabel,
  acceptedLabel = "受け付けました",
  disabled = false,
  onClick,
  className,
  type = "button",
}: SubmitMorphProps) {
  const reduce = useReducedMotion();
  const processing = phase === "processing";
  const accepted = phase === "accepted";
  const busy = processing || accepted;

  return (
    <motion.div
      layout={!reduce}
      className="w-full"
      whileTap={
        disabled || busy || reduce ? undefined : { scale: MOTION_SCALE.tap }
      }
      transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.tap}
    >
      <Button
        type={type}
        variant="primary"
        size="lg"
        onClick={onClick}
        disabled={disabled || busy}
        isLoading={processing}
        className={cn(
          "h-14 w-full rounded-[var(--radius-large)] text-base sm:h-16 sm:text-lg",
          processing && "motion-submit-processing",
          accepted && "motion-submit-accepted",
          className,
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={phase}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.base}
            className="inline-flex items-center justify-center"
          >
            {accepted
              ? acceptedLabel
              : processing
                ? (processingLabel ?? children)
                : children}
          </motion.span>
        </AnimatePresence>
      </Button>
    </motion.div>
  );
}
