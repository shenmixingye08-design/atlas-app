"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

const PHASES = [
  ui.secretaryProgress.understanding,
  ui.secretaryProgress.thinking,
  ui.secretaryProgress.executing,
] as const;

const PHASE_INTERVAL_MS = 2200;

type SecretaryProgressProps = {
  /** Cycle through the secretary phrases (default) or show a single line. */
  message?: string;
  className?: string;
};

/**
 * Elegant loading indicator for the home / commander flow.
 * Replaces generic「読み込み」with calm AI-secretary phrasing.
 * Pure client-side cycling — no AI cost.
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
        className="animate-fade-in text-sm font-medium tracking-tight text-[var(--text-secondary)]"
      >
        {label}
      </p>
    </div>
  );
}
