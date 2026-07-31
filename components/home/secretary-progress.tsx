"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

/** Phase3 first-run wait — secretary phrases only, cycles past 30s. */
const PHASES = [
  ui.secretaryProgress.understand,
  ui.secretaryProgress.write,
  ui.secretaryProgress.polish,
  ui.secretaryProgress.finalCheck,
] as const;

const PHASE_INTERVAL_MS = 7000;

type SecretaryProgressProps = {
  /** Cycle through the secretary phrases (default) or show a single line. */
  message?: string;
  className?: string;
};

/**
 * Calm wait indicator — no tool / model names.
 */
export function SecretaryProgress({ message, className }: SecretaryProgressProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (message) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % PHASES.length);
    }, PHASE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [message]);

  const label = message ?? PHASES[index];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16 text-center",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="lux-spinner h-9 w-9" aria-hidden />
      <p
        key={label}
        className="animate-fade-in text-base font-medium tracking-tight text-foreground sm:text-lg"
      >
        {label}
      </p>
    </div>
  );
}
