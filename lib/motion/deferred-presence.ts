"use client";

import { useEffect, useState } from "react";

import { MOTION_MS } from "@/lib/motion/tokens";

/**
 * Keep the last overlay payload mounted until the exit animation can finish.
 * Parents still own open/close; this only delays unmount.
 */
export function useDeferredPresence<T>(
  value: T | null,
  exitMs: number = MOTION_MS.modal + 40,
): { item: T | null; open: boolean } {
  const [held, setHeld] = useState<T | null>(value);

  if (value !== null && !Object.is(held, value)) {
    setHeld(value);
  }

  useEffect(() => {
    if (value !== null) return;
    const timer = window.setTimeout(() => {
      setHeld(null);
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [value, exitMs]);

  return {
    item: value ?? held,
    open: value !== null,
  };
}
