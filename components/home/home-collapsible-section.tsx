"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useId,
  useState,
  type ReactNode,
} from "react";

import { ExpandPanel } from "@/components/motion/expand-panel";
import { cn } from "@/lib/design-system/cn";
import { MOTION_REDUCED, MOTION_TRANSITION } from "@/lib/motion/tokens";

const STORAGE_PREFIX = "atlas-home-collapse:";

function readStoredOpenState(storageKey: string, defaultOpen: boolean): boolean {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "open") return true;
    if (stored === "closed") return false;
  } catch {
    // Keep the server/client fallback when storage is unavailable.
  }
  return defaultOpen;
}

type HomeCollapsibleSectionProps = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

export function HomeCollapsibleSection({
  id,
  title,
  subtitle,
  badge,
  defaultOpen = false,
  children,
  className,
}: HomeCollapsibleSectionProps) {
  const headingId = useId();
  const reduce = useReducedMotion();
  const storageKey = `${STORAGE_PREFIX}${id}`;
  const [open, setOpen] = useState(() =>
    readStoredOpenState(storageKey, defaultOpen),
  );

  const toggle = useCallback(() => {
    setOpen((value) => {
      const next = !value;
      try {
        localStorage.setItem(storageKey, next ? "open" : "closed");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  return (
    <motion.section
      layout={reduce ? false : true}
      transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.base}
      className={cn(
        "overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      <button
        type="button"
        id={headingId}
        aria-expanded={open}
        onClick={toggle}
        className="touch-target flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors duration-[var(--motion-base)] hover:bg-[var(--surface-muted)] focus-ring"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-foreground">{title}</span>
            {badge && (
              <span className="rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] font-medium text-accent">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{subtitle}</p>
          )}
        </div>
        <motion.span
          className="shrink-0 text-sm text-[var(--text-muted)]"
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.base}
        >
          ▼
        </motion.span>
      </button>

      <ExpandPanel open={open}>
        <div className="border-t border-[var(--border)] px-5 py-5">{children}</div>
      </ExpandPanel>
    </motion.section>
  );
}
