"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/design-system/cn";

const STORAGE_PREFIX = "atlas-home-collapse:";

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
  const storageKey = `${STORAGE_PREFIX}${id}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "open") setOpen(true);
      if (stored === "closed") setOpen(false);
    } catch {
      setOpen(defaultOpen);
    }
  }, [storageKey, defaultOpen]);

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
    <section
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
        <span
          className={cn(
            "shrink-0 text-sm text-[var(--text-muted)] transition-transform duration-[var(--motion-base)]",
            open && "rotate-180",
          )}
          aria-hidden
        >
          ▼
        </span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-[var(--motion-base)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[var(--border)] px-5 py-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
