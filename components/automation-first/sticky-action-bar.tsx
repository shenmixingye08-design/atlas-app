"use client";

import { cn } from "@/lib/design-system/cn";

export type StickyActionBarProps = {
  children: React.ReactNode;
  className?: string;
};

export function StickyActionBar({ children, className }: StickyActionBarProps) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-[var(--z-sticky)] border-t border-[var(--border)] bg-[var(--surface-elevated)]/95 px-4 py-3 backdrop-blur-sm",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <div className="mx-auto flex max-w-[var(--content-default)] flex-wrap items-center justify-end gap-2">
        {children}
      </div>
    </div>
  );
}
