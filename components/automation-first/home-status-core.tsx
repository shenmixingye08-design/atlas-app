"use client";

import Link from "next/link";

import type { HomeCoreState } from "@/lib/automation-first/home-core-state";
import { cn } from "@/lib/design-system/cn";

/**
 * The home "AI core": a small orb whose motion reflects real state
 * (checking / running / attention / scheduled / idle) plus one status line.
 * CSS-only (transform/opacity), paused under reduced motion and motion-lite.
 */
export function HomeStatusCore({ state }: { state: HomeCoreState }) {
  const body = (
    <>
      <span
        className={cn(
          "home-core-orb",
          state.kind === "completed" && "motion-complete-bloom",
        )}
        aria-hidden
      >
        <span className="home-core-orb__halo" />
        <span className="home-core-orb__ring" />
        <span className="home-core-orb__core" />
        {state.kind === "completed" ? (
          <svg viewBox="0 0 24 24" className="home-core-orb__check">
            <path
              d="M7.5 12.4 10.6 15.5 16.5 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="motion-complete-check"
            />
          </svg>
        ) : null}
      </span>
      <span
        key={`${state.kind}:${state.label}`}
        className="home-core-text min-w-0 flex-1"
      >
        <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
          {state.label}
        </span>
        {state.detail ? (
          <span className="block truncate text-[length:var(--text-meta)] text-[var(--text-secondary)]">
            {state.detail}
          </span>
        ) : null}
      </span>
      {state.href ? (
        <span
          aria-hidden
          className="home-core-chevron shrink-0 text-[var(--text-muted)]"
        >
          ›
        </span>
      ) : null}
    </>
  );

  const className = cn(
    "home-core group flex min-h-[var(--touch-target)] items-center gap-3 rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 shadow-[var(--shadow-subtle)]",
    state.href &&
      "motion-press-card focus-ring transition-[border-color,box-shadow] duration-[var(--motion-fast)] [@media(hover:hover)_and_(pointer:fine)]:hover:border-[var(--border-strong)]",
  );

  return (
    <div role="status" aria-live="polite" data-testid="home-status-core">
      {state.href ? (
        <Link href={state.href} data-state={state.kind} className={className}>
          {body}
        </Link>
      ) : (
        <div data-state={state.kind} className={className}>
          {body}
        </div>
      )}
    </div>
  );
}
