"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { runAutomationNow } from "@/lib/automations/client";
import { getTodaysAutomations } from "@/lib/automations/today";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations } from "@/lib/compatibility";
import {
  automationToDashboardJob,
  sortAutomationJobs,
} from "@/lib/home/today-dashboard";
import {
  getSkippedAutomationIds,
  isAutomationSkippedToday,
} from "@/lib/home/today-skipped-store";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type HomeStartNowCtaProps = {
  automations: Automation[];
  onAutomationRun?: () => void;
};

export function HomeStartNowCta({
  automations,
  onAutomationRun,
}: HomeStartNowCtaProps) {
  const [loading, setLoading] = useState(false);

  const firstJob = useMemo(() => {
    try {
      const automationsSafe = normalizeAutomations(automations);
      const skippedAutomationIds = new Set(getSkippedAutomationIds());
      const jobs = getTodaysAutomations(automationsSafe)
        .map(({ automation }) =>
          automationToDashboardJob(
            automation,
            skippedAutomationIds.has(automation.id) ||
              isAutomationSkippedToday(automation.id),
          ),
        )
        .filter((job) => job.status !== "completed" && job.status !== "skipped");

      return sortAutomationJobs(jobs)[0] ?? null;
    } catch {
      return null;
    }
  }, [automations]);

  const handleStart = async () => {
    if (!firstJob?.automationId) return;
    setLoading(true);
    try {
      await runAutomationNow(firstJob.automationId);
      onAutomationRun?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      aria-label={ui.homeUx.startNowLabel}
      className="rounded-[var(--radius-xl)] border border-[var(--accent)]/20 bg-[var(--accent-muted)] p-5 shadow-[var(--shadow-sm)]"
    >
      {firstJob ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-accent">{ui.homeUx.startNowLabel}</p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">
              {firstJob.title}
            </p>
            {firstJob.scheduledTime && (
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                {firstJob.scheduledTime}
              </p>
            )}
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full shrink-0 sm:w-auto"
            isLoading={loading}
            onClick={() => void handleStart()}
          >
            {ui.homeUx.startNow}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-accent">{ui.homeUx.startNowLabel}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {ui.homeUx.startNowEmpty}
            </p>
          </div>
          <Link href="/workspace" className="w-full sm:w-auto">
            <Button variant="primary" size="lg" className="w-full">
              {ui.homeUx.addWork}
            </Button>
          </Link>
        </div>
      )}
    </section>
  );
}
