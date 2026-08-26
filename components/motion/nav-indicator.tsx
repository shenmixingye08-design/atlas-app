"use client";

import Link from "next/link";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/design-system/cn";
import {
  MOTION_REDUCED,
  MOTION_SCALE,
  MOTION_SPRING_SOFT,
  MOTION_SPRING_TAP,
  MOTION_TRANSITION,
  MOTION_Y,
} from "@/lib/motion/tokens";

type BottomNavIndicatorProps = {
  index: number;
  count: number;
  hidden?: boolean;
};

/**
 * Sliding selected-tab pill. Uses translateX (own width * index),
 * not left/width, so layout stays fixed.
 */
export function BottomNavIndicator({
  index,
  count,
  hidden = false,
}: BottomNavIndicatorProps) {
  const reduce = useReducedMotion();

  if (hidden || count <= 0 || index < 0 || index >= count) {
    return null;
  }

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-1 bottom-1 rounded-[var(--radius-md)] bg-[var(--brand-muted)]"
      style={{ width: `${100 / count}%` }}
      initial={false}
      animate={{ x: `${index * 100}%` }}
      transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.nav}
    />
  );
}

type BottomNavGroupProps = {
  children: ReactNode;
  className?: string;
};

export function BottomNavGroup({ children, className }: BottomNavGroupProps) {
  return (
    <LayoutGroup>
      <ul className={className}>{children}</ul>
    </LayoutGroup>
  );
}

type BottomNavTabProps = {
  href?: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  pillId: string;
  primary?: boolean;
  onClick?: () => void;
  className?: string;
};

/**
 * Bottom-nav item: sliding layoutId pill, icon pop, label lift, tap sink.
 * Color change alone is not the selected-state signal.
 */
export function BottomNavTab({
  href,
  label,
  icon,
  active,
  pillId,
  primary = false,
  onClick,
  className,
}: BottomNavTabProps) {
  const reduce = useReducedMotion();
  const tap = reduce ? undefined : { scale: MOTION_SCALE.tapNav };

  const body = (
    <>
      {!primary && active ? (
        reduce ? (
          <span
            aria-hidden
            className="absolute inset-y-1 inset-x-0.5 rounded-[var(--radius-md)] bg-[var(--brand-muted)]"
          />
        ) : (
          <motion.span
            layoutId={pillId}
            aria-hidden
            className="absolute inset-y-1 inset-x-0.5 rounded-[var(--radius-md)] bg-[var(--brand-muted)]"
            transition={MOTION_SPRING_SOFT}
          />
        )
      ) : null}
      <motion.span
        aria-hidden
        className={cn(
          "relative z-10 flex items-center justify-center",
          primary &&
            "h-9 w-9 rounded-[var(--radius-large)] bg-[var(--primary)] text-[var(--accent-foreground)] shadow-[var(--shadow-subtle)]",
        )}
        initial={false}
        animate={
          reduce
            ? { scale: 1 }
            : active && !primary
              ? { scale: [1, MOTION_SCALE.navIcon, 1] }
              : { scale: 1 }
        }
        transition={
          reduce
            ? MOTION_REDUCED
            : { duration: 0.32, times: [0, 0.45, 1], ease: "easeOut" }
        }
      >
        {icon}
      </motion.span>
      <motion.span
        className="relative z-10"
        initial={false}
        animate={{ y: !reduce && active && !primary ? MOTION_Y.navLabel : 0 }}
        transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.base}
      >
        {label}
      </motion.span>
    </>
  );

  const itemClass = cn(
    "relative flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-0.5 text-[11px] font-medium leading-tight focus-ring",
    className,
  );

  return (
    <li className="relative z-10 flex-1">
      <motion.div
        className="h-full"
        whileTap={tap}
        transition={reduce ? MOTION_REDUCED : MOTION_SPRING_TAP}
      >
        {href ? (
          <Link
            href={href}
            onClick={onClick}
            className={itemClass}
            aria-current={active ? "page" : undefined}
          >
            {body}
          </Link>
        ) : (
          <button type="button" onClick={onClick} className={itemClass}>
            {body}
          </button>
        )}
      </motion.div>
    </li>
  );
}
