"use client";

import Link from "next/link";
import { useMemo } from "react";

import { getOnboardingState } from "@/lib/onboarding";
import {
  RETENTION_DAY_PLAN,
  loadRetentionState,
  resolveDayStatus,
  resolveRetentionDayNumber,
} from "@/lib/retention";
import { cn } from "@/lib/design-system/cn";

export function RetentionDayPlanPanel() {
  const model = useMemo(() => {
    const onboarding = getOnboardingState();
    const state = loadRetentionState();
    const currentDay = resolveRetentionDayNumber(onboarding.createdAt);
    return RETENTION_DAY_PLAN.map((def) => {
      const progress = state.dayPlan.find((d) => d.day === def.day);
      const status = resolveDayStatus({
        day: def.day,
        currentDay,
        completedAt: progress?.completedAt ?? null,
      });
      return { def, status, progress };
    });
  }, []);

  return (
    <section
      aria-labelledby="retention-day-plan-heading"
      className="space-y-3"
      data-testid="retention-day-plan"
    >
      <div>
        <h2
          id="retention-day-plan-heading"
          className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
        >
          7日でAI秘書を完成
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          毎日最低1回、成果物完成を目指します。
        </p>
      </div>
      <ol className="space-y-2">
        {model.map(({ def, status }) => (
          <li key={def.day}>
            <Link
              href={status === "locked" ? "#" : def.href}
              aria-disabled={status === "locked"}
              className={cn(
                "flex items-start gap-3 rounded-[var(--radius-md)] border px-3 py-3",
                status === "current" &&
                  "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface-elevated))]",
                status === "done" && "border-[var(--border)] bg-[var(--surface-muted)]",
                status === "missed" && "border-[var(--warning)]/40 bg-[var(--warning-bg)]",
                status === "locked" &&
                  "pointer-events-none border-[var(--border)] opacity-55",
              )}
            >
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-xs font-semibold">
                {status === "done" ? "✓" : def.day}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Day{def.day} {def.title}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{def.summary}</p>
                {status === "current" || status === "missed" ? (
                  <span className="mt-1 inline-block text-xs font-semibold text-[var(--brand)]">
                    {def.ctaLabel}
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
