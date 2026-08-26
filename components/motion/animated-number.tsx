"use client";

import { useEffect, useRef, useState } from "react";

import { useMotionProfile } from "@/components/motion/motion-provider";
import { cn } from "@/lib/design-system/cn";
import { MOTION_MS } from "@/lib/motion/tokens";

type AnimatedNumberProps = {
  value: number;
  className?: string;
  suffix?: string;
  prefix?: string;
};

/**
 * Interpolates tabular numbers. Skips animation on reduced motion / lite.
 * Never invents a value — always lands on the real `value`.
 */
export function AnimatedNumber({
  value,
  className,
  suffix = "",
  prefix = "",
}: AnimatedNumberProps) {
  const { lite, reduce } = useMotionProfile();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    if (lite || reduce || value === fromRef.current) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const to = value;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MOTION_MS.number);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setDisplay(to);
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value, lite, reduce]);

  const rounded = Number.isInteger(value)
    ? Math.round(display)
    : Math.round(display * 10) / 10;

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {rounded}
      {suffix}
    </span>
  );
}
