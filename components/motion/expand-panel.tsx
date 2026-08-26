"use client";

import { cn } from "@/lib/design-system/cn";
import type { ReactNode } from "react";

type ExpandPanelProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Expand/collapse without animating height per frame.
 * Uses grid-template-rows 0fr → 1fr so content fades in as the track opens.
 */
export function ExpandPanel({ open, children, className }: ExpandPanelProps) {
  return (
    <div
      className={cn(
        "motion-expand grid",
        open ? "motion-expand--open" : "motion-expand--closed",
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "motion-expand-inner",
            open ? "opacity-100" : "opacity-0",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
