"use client";

import { cn } from "@/lib/design-system/cn";
import type { UserProgressSnapshot } from "@/lib/workspace/user-progress";

type UserFacingProgressProps = {
  snapshot: UserProgressSnapshot | null;
  className?: string;
};

export function UserFacingProgress({
  snapshot,
  className,
}: UserFacingProgressProps) {
  if (!snapshot) {
    return (
      <div
        className={cn(
          "rounded-3xl border border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <span className="lux-spinner mx-auto h-9 w-9" aria-hidden />
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          🧠 内容を整理しています…
        </p>
      </div>
    );
  }

  const current = snapshot.steps[snapshot.activeStepIndex];

  return (
    <div
      className={cn(
        "user-progress-enter rounded-3xl border border-[var(--border)] bg-[var(--card)] px-5 py-8 shadow-[0_12px_40px_rgba(0,0,0,0.04)] sm:px-8",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy={snapshot.phase !== "completed"}
    >
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-5 flex h-14 w-14 items-center justify-center">
          {snapshot.phase !== "completed" ? (
            <span className="lux-spinner absolute inset-0 h-14 w-14" aria-hidden />
          ) : null}
          <span className="relative text-2xl" aria-hidden>
            {current?.icon ?? "✨"}
          </span>
        </div>
        <p className="text-xs font-medium tracking-[0.14em] text-[var(--text-muted)]">
          AI秘書が仕事を進めています
        </p>
        <p
          key={snapshot.headline}
          className="mt-3 animate-fade-in text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        >
          {snapshot.headline}
        </p>
        <p className="mt-2 text-sm tabular-nums text-[var(--text-muted)]">
          {snapshot.progressPercent}%
        </p>
      </div>

      <div className="mx-auto mt-6 h-2 max-w-md overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
          style={{ width: `${snapshot.progressPercent}%` }}
        />
      </div>

      <ol className="mx-auto mt-8 max-w-lg space-y-3">
        {snapshot.steps.map((step) => {
          const isCurrent = step.status === "current";
          const isDone = step.status === "completed";
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-300",
                isCurrent && "bg-[var(--accent-muted)]",
                !isCurrent && !isDone && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm",
                  isDone && "bg-[var(--success-bg)] text-[var(--success)]",
                  isCurrent && "bg-[var(--card)] text-foreground shadow-sm",
                  !isDone && !isCurrent && "bg-[var(--surface-muted)] text-[var(--text-muted)]",
                )}
                aria-hidden
              >
                {isDone ? "✓" : step.icon}
              </span>
              <span
                className={cn(
                  "text-sm",
                  isCurrent
                    ? "font-semibold text-foreground"
                    : isDone
                      ? "text-[var(--text-secondary)]"
                      : "text-[var(--text-muted)]",
                )}
              >
                {isCurrent ? step.activeLabel : step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
