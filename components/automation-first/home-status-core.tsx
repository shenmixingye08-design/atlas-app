"use client";

import Link from "next/link";

import type { HomeCoreState } from "@/lib/automation-first/home-core-state";
import { cn } from "@/lib/design-system/cn";

/** The orb alone (state-driven motion). Wrap in `.home-core[data-state]`. */
export function HomeCoreOrb({ kind }: { kind: HomeCoreState["kind"] }) {
  return (
    <span
      className={cn(
        "home-core-orb",
        kind === "completed" && "motion-complete-bloom",
      )}
      aria-hidden
    >
      <span className="home-core-orb__halo" />
      <span className="home-core-orb__ring" />
      <span className="home-core-orb__core" />
      {kind === "completed" ? (
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
  );
}

/** Small idle orb for inline use (e.g. beside the greeting). */
export function HomeCoreBadge({ kind = "idle" }: { kind?: HomeCoreState["kind"] }) {
  return (
    <span data-state={kind} className="home-core home-core--inline" aria-hidden>
      <HomeCoreOrb kind={kind} />
    </span>
  );
}

/**
 * The home "AI core": a small orb whose motion reflects real state
 * (checking / running / attention / scheduled / idle) plus one status line.
 * CSS-only (transform/opacity), paused under reduced motion and motion-lite.
 */
export function HomeStatusCore({ state }: { state: HomeCoreState }) {
  const body = (
    <>
      <HomeCoreOrb kind={state.kind} />
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
        <span aria-hidden className="ui-chevron">
          ›
        </span>
      ) : null}
    </>
  );

  const className = cn(
    "home-core ui-card group flex min-h-[3.75rem] items-center gap-3 px-4 py-3",
    state.href && "motion-press-card ui-card-interactive focus-ring",
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
