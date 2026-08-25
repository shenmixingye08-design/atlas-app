import type { ReactNode } from "react";

import { cn } from "@/lib/design-system/cn";

type ContentSwapProps = {
  ready: boolean;
  pending: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Crossfade skeleton/loading → content without collapsing the layout.
 * Opacity only — no width/height animation.
 */
export function ContentSwap({
  ready,
  pending,
  children,
  className,
}: ContentSwapProps) {
  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "transition-opacity duration-[var(--motion-base)]",
          ready ? "pointer-events-none absolute inset-0 opacity-0" : "opacity-100",
        )}
        aria-hidden={ready || undefined}
      >
        {pending}
      </div>
      <div
        className={cn(
          "transition-opacity duration-[var(--motion-base)]",
          ready ? "opacity-100" : "invisible h-0 overflow-hidden opacity-0",
        )}
      >
        {ready ? children : null}
      </div>
    </div>
  );
}
