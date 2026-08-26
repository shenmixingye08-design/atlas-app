"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  Children,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useMotionLite } from "@/components/motion/motion-provider";
import { cn } from "@/lib/design-system/cn";
import { consumeSessionMotion } from "@/lib/motion/play-once";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import {
  MOTION_MS,
  MOTION_REDUCED,
  MOTION_STAGGER_CAP,
  MOTION_TRANSITION,
  MOTION_Y,
} from "@/lib/motion/tokens";

type RevealStaggerProps = {
  children: ReactNode;
  playKey: string;
  className?: string;
};

/**
 * First-visit staggered rise for header → action → recent work.
 * Replays are skipped via sessionStorage so returning home stays quiet.
 */
export function RevealStagger({
  children,
  playKey,
  className,
}: RevealStaggerProps) {
  const reduce = useReducedMotion();
  const lite = useMotionLite();
  const [play, setPlay] = useState(false);
  const items = useMemo(() => Children.toArray(children), [children]);

  useEffect(() => {
    if (reduce || lite) return;
    return scheduleMountWork(() => {
      setPlay(consumeSessionMotion(playKey));
    });
  }, [playKey, reduce, lite]);

  return (
    <div className={cn("min-w-0", className)}>
      {items.map((child, index) => (
        <RevealItem key={index} index={index} play={play}>
          {child}
        </RevealItem>
      ))}
    </div>
  );
}

function RevealItem({
  children,
  index,
  play,
}: {
  children: ReactNode;
  index: number;
  play: boolean;
}) {
  const delay =
    play && index < MOTION_STAGGER_CAP
      ? (index * MOTION_MS.stagger) / 1000
      : 0;

  if (!play) {
    return <div className="min-w-0">{children}</div>;
  }

  return (
    <motion.div
      className="min-w-0"
      initial={{ opacity: 0, y: MOTION_Y.page }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...MOTION_TRANSITION.page, delay }}
    >
      {children}
    </motion.div>
  );
}

type RevealSectionProps = {
  children: ReactNode;
  className?: string;
  delayIndex?: number;
};

/** Single section rise — used when the parent already owns play-once. */
export function RevealSection({
  children,
  className,
  delayIndex = 0,
}: RevealSectionProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: MOTION_Y.page }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        ...MOTION_TRANSITION.page,
        delay: (Math.min(delayIndex, MOTION_STAGGER_CAP) * MOTION_MS.stagger) / 1000,
      }}
    >
      {children}
    </motion.div>
  );
}

export { MOTION_REDUCED };
