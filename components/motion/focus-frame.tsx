"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/design-system/cn";

type FocusFrameProps = {
  focused: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * When the request field is focused, surrounding chrome recedes via opacity.
 * No layout shift — only opacity/transform on a wrapper.
 */
export function FocusFrame({ focused, children, className }: FocusFrameProps) {
  return (
    <div
      className={cn(
        "motion-focus-frame",
        focused && "motion-focus-frame--active",
        className,
      )}
    >
      {children}
    </div>
  );
}

type FocusRecedeProps = {
  focused: boolean;
  children: ReactNode;
  className?: string;
};

export function FocusRecede({ focused, children, className }: FocusRecedeProps) {
  return (
    <div
      className={cn(
        "origin-top transition-[opacity,transform] duration-[var(--motion-base)]",
        focused ? "pointer-events-none scale-[0.985] opacity-40" : "opacity-100",
        className,
      )}
      aria-hidden={focused || undefined}
    >
      {children}
    </div>
  );
}
