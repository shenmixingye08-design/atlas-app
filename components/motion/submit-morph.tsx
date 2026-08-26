"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/design-system/cn";
import { MOTION_REDUCED, MOTION_SCALE, MOTION_TRANSITION } from "@/lib/motion/tokens";

export type SubmitPhase = "idle" | "processing";

type SubmitMorphProps = {
  phase: SubmitPhase;
  children: ReactNode;
  processingLabel?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
};

/**
 * Press → processing morph. Does not render a completed state — parent
 * must wait for a real accepted/completed screen before celebrating.
 */
export function SubmitMorph({
  phase,
  children,
  processingLabel,
  disabled = false,
  onClick,
  className,
  type = "button",
}: SubmitMorphProps) {
  const reduce = useReducedMotion();
  const processing = phase === "processing";

  return (
    <motion.div
      layout={!reduce}
      className="w-full"
      whileTap={
        disabled || processing || reduce
          ? undefined
          : { scale: MOTION_SCALE.tap }
      }
      transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.tap}
    >
      <Button
        type={type}
        variant="primary"
        size="lg"
        onClick={onClick}
        disabled={disabled || processing}
        isLoading={processing}
        className={cn(
          "h-14 w-full rounded-[var(--radius-large)] text-base sm:h-16 sm:text-lg",
          processing && "motion-submit-processing",
          className,
        )}
      >
        {processing ? (processingLabel ?? children) : children}
      </Button>
    </motion.div>
  );
}
