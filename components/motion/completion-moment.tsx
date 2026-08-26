"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

import { useMotionLite } from "@/components/motion/motion-provider";
import { cn } from "@/lib/design-system/cn";
import { consumeCompletionMotion } from "@/lib/motion/play-once";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import {
  MOTION_MS,
  MOTION_REDUCED,
  MOTION_TRANSITION,
  MOTION_Y,
} from "@/lib/motion/tokens";

type CompletionMomentProps = {
  id: string;
  liveMessage: string;
  children: ReactNode;
  className?: string;
};

/**
 * Signature MINERVOT completion: drawn check, soft bloom, a few sparks,
 * then the deliverable rises. Plays once per id. Actions stay clickable.
 */
export function CompletionMoment({
  id,
  liveMessage,
  children,
  className,
}: CompletionMomentProps) {
  const reduce = useReducedMotion();
  const lite = useMotionLite();
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!id || reduce || lite) return;
    return scheduleMountWork(() => {
      setCelebrate(consumeCompletionMotion(id));
    });
  }, [id, reduce, lite]);

  return (
    <div className={cn("relative min-w-0", className)}>
      {celebrate ? (
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </div>
      ) : null}

      <div className="mb-6 flex flex-col items-center">
        <div
          className={cn(
            "relative flex h-16 w-16 items-center justify-center",
            celebrate && "motion-complete-bloom",
          )}
        >
          {celebrate ? <CompletionSparks /> : null}
          <CompletionCheck animate={celebrate} reduce={Boolean(reduce)} />
        </div>
      </div>

      <motion.div
        initial={
          celebrate
            ? { opacity: 0, y: MOTION_Y.complete }
            : reduce
              ? { opacity: 0 }
              : false
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduce
            ? MOTION_REDUCED
            : {
                ...MOTION_TRANSITION.page,
                delay: celebrate ? MOTION_MS.complete / 2000 : 0,
              }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}

function CompletionCheck({
  animate,
  reduce,
}: {
  animate: boolean;
  reduce: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className="relative z-10 h-16 w-16 text-[var(--success)]"
      aria-hidden
    >
      <circle
        cx="24"
        cy="24"
        r="18"
        fill="var(--success-bg)"
        stroke="currentColor"
        strokeWidth="1.75"
        className={animate ? "motion-complete-ring" : undefined}
      />
      <path
        d="M16 24.5 21.2 30 32.5 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={
          animate && !reduce ? "motion-complete-check" : undefined
        }
      />
    </svg>
  );
}

function CompletionSparks() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      <i className="motion-complete-spark motion-complete-spark--1" />
      <i className="motion-complete-spark motion-complete-spark--2" />
      <i className="motion-complete-spark motion-complete-spark--3" />
      <i className="motion-complete-spark motion-complete-spark--4" />
    </span>
  );
}
