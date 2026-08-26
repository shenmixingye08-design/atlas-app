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
  MOTION_SCALE,
  MOTION_STAGGER_CAP,
  MOTION_TRANSITION,
  MOTION_Y,
  pageTravelY,
} from "@/lib/motion/tokens";

type RevealStaggerProps = {
  children: ReactNode;
  playKey: string;
  className?: string;
};

/**
 * Session-once staggered rise for header → action → recent work.
 * Replays when the browser session is new. Lite still moves; only
 * Reduced Motion skips the intro.
 */
export function RevealStagger({
  children,
  playKey,
  className,
}: RevealStaggerProps) {
  const reduce = useReducedMotion();
  const [play, setPlay] = useState(false);
  const items = useMemo(() => Children.toArray(children), [children]);

  useEffect(() => {
    if (reduce) return;
    return scheduleMountWork(() => {
      setPlay(consumeSessionMotion(playKey));
    });
  }, [playKey, reduce]);

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
  const lite = useMotionLite();
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
      initial={{
        opacity: 0,
        y: lite ? pageTravelY(true) : MOTION_Y.home,
        scale: MOTION_SCALE.home,
      }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
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
  const lite = useMotionLite();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{
        opacity: 0,
        y: lite ? pageTravelY(true) : MOTION_Y.home,
        scale: MOTION_SCALE.home,
      }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
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
