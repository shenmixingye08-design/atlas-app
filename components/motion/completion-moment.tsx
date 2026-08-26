"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useMotionLite } from "@/components/motion/motion-provider";
import { cn } from "@/lib/design-system/cn";
import { consumeCompletionMotion } from "@/lib/motion/play-once";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import {
  MOTION_REDUCED,
  MOTION_SCALE,
  MOTION_TRANSITION,
  MOTION_Y,
} from "@/lib/motion/tokens";

type CompletionPlay = {
  celebrate: boolean;
  reduce: boolean;
  lite: boolean;
};

const CompletionPlayContext = createContext<CompletionPlay>({
  celebrate: false,
  reduce: false,
  lite: false,
});

export function useCompletionPlay(): CompletionPlay {
  return useContext(CompletionPlayContext);
}

type CompletionMomentProps = {
  id: string;
  liveMessage: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

const SPARK_COUNT_FULL = 8;
const SPARK_COUNT_LITE = 0;
const CARD_DELAY = 0.42;
const ACTION_DELAY = 0.68;

/**
 * Signature MINERVOT completion: ring, stroke check, a few sparks,
 * deliverable rise, delayed actions, one sheen. Plays once per id.
 * Lite keeps check + card; it may drop sparks and sheen.
 */
export function CompletionMoment({
  id,
  liveMessage,
  children,
  actions,
  className,
}: CompletionMomentProps) {
  const reduce = useReducedMotion();
  const lite = useMotionLite();
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!id || reduce) return;
    return scheduleMountWork(() => {
      setCelebrate(consumeCompletionMotion(id));
    });
  }, [id, reduce]);

  const play = celebrate && !reduce;

  return (
    <CompletionPlayContext.Provider
      value={{ celebrate: play, reduce: Boolean(reduce), lite }}
    >
      <div className={cn("relative min-w-0", className)}>
        {play ? (
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {liveMessage}
          </div>
        ) : null}

        <div className="mb-6 flex flex-col items-center">
          <div
            className={cn(
              "relative flex h-16 w-16 items-center justify-center",
              play && "motion-complete-bloom",
            )}
          >
            {play && !lite ? <CompletionSparks count={SPARK_COUNT_FULL} /> : null}
            {play && lite && SPARK_COUNT_LITE > 0 ? (
              <CompletionSparks count={SPARK_COUNT_LITE} />
            ) : null}
            <CompletionCheck animate={play} reduce={Boolean(reduce)} />
          </div>
        </div>

        <motion.div
          className="relative overflow-hidden rounded-[inherit]"
          initial={
            play
              ? { opacity: 0, y: MOTION_Y.complete, scale: MOTION_SCALE.complete }
              : reduce
                ? { opacity: 0 }
                : false
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            reduce
              ? MOTION_REDUCED
              : {
                  ...MOTION_TRANSITION.page,
                  delay: play ? CARD_DELAY : 0,
                }
          }
        >
          {play && !lite ? (
            <span aria-hidden className="motion-complete-sheen" />
          ) : null}
          {children}
        </motion.div>

        {actions ? (
          <CompletionActions>{actions}</CompletionActions>
        ) : null}
      </div>
    </CompletionPlayContext.Provider>
  );
}

export function CompletionActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { celebrate, reduce } = useCompletionPlay();

  return (
    <motion.div
      className={className}
      initial={celebrate && !reduce ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce
          ? MOTION_REDUCED
          : {
              ...MOTION_TRANSITION.base,
              delay: celebrate ? ACTION_DELAY : 0,
            }
      }
    >
      {children}
    </motion.div>
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

function CompletionSparks({ count }: { count: number }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: count }, (_, index) => (
        <i
          key={index}
          className={`motion-complete-spark motion-complete-spark--${index + 1}`}
        />
      ))}
    </span>
  );
}
