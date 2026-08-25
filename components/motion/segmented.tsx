"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

import { cn } from "@/lib/design-system/cn";
import { MOTION_REDUCED, MOTION_TRANSITION } from "@/lib/motion/tokens";

export type SegmentedOption<T extends string = string> = {
  id: T;
  label: string;
};

type SegmentedControlProps<T extends string = string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  className?: string;
  /** pill: muted track + raised thumb. brand: filled brand chip. */
  variant?: "pill" | "brand";
};

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  variant = "pill",
}: SegmentedControlProps<T>) {
  const layoutId = useId();
  const reduce = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        variant === "pill" &&
          "inline-flex gap-1 rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-1 ring-1 ring-[var(--border)]",
        variant === "brand" && "flex flex-wrap gap-2",
        className,
      )}
    >
      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.id)}
            className={cn(
              "relative z-10 min-h-[44px] px-4 py-2 text-sm font-medium focus-ring",
              variant === "pill" &&
                "rounded-[var(--radius-md)] transition-[color] duration-[var(--motion-fast)]",
              variant === "brand" &&
                "rounded-[var(--radius-md)] transition-[color,border-color] duration-[var(--motion-fast)]",
              variant === "pill" &&
                (isActive
                  ? "text-foreground"
                  : "text-[var(--text-secondary)] hover:text-foreground"),
              variant === "brand" &&
                (isActive
                  ? "text-[var(--brand-foreground)]"
                  : "border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]"),
            )}
          >
            {isActive ? (
              <motion.span
                layoutId={reduce ? undefined : `${layoutId}-thumb`}
                aria-hidden
                className={cn(
                  "absolute inset-0 -z-10",
                  variant === "pill" &&
                    "rounded-[var(--radius-md)] bg-[var(--card)] shadow-sm ring-1 ring-[var(--border)]",
                  variant === "brand" &&
                    "rounded-[var(--radius-md)] bg-[var(--brand)]",
                )}
                transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.nav}
              />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
