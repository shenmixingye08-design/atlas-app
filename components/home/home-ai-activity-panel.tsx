"use client";

import { useEffect, useMemo, useState } from "react";

import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import {
  automationToDashboardJob,
  isActiveJob,
  partitionProjectsForToday,
} from "@/lib/home/today-dashboard";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

type HomeAiActivityPanelProps = {
  automations: Automation[];
  projects: Project[];
};

const ACTIVITY_LABELS: Record<string, string> = {
  sns: "X投稿を作成しています",
  blog: "ブログを投稿しています",
  sales: "資料を作成しています",
  email: "メールを送信しています",
  drive: "ファイルを整理しています",
  general: "仕事を進めています",
};

const CYCLE_MS = 4000;
const REFRESH_MS = 20000;

function resolveActivityLabel(activityLabel: string | null, title: string): string {
  if (!activityLabel) {
    return ACTIVITY_LABELS.general;
  }
  if (/sns|x投稿|投稿/i.test(`${activityLabel} ${title}`)) {
    return ACTIVITY_LABELS.sns;
  }
  if (/ブログ|blog/i.test(`${activityLabel} ${title}`)) {
    return ACTIVITY_LABELS.blog;
  }
  if (/メール|mail/i.test(`${activityLabel} ${title}`)) {
    return ACTIVITY_LABELS.email;
  }
  if (/資料|ppt|営業/i.test(`${activityLabel} ${title}`)) {
    return ACTIVITY_LABELS.sales;
  }
  if (/画像|生成/i.test(`${activityLabel} ${title}`)) {
    return "画像を生成しています";
  }
  return activityLabel.endsWith("中")
    ? activityLabel.replace(/中$/, "しています")
    : activityLabel;
}

export function HomeAiActivityPanel({ automations, projects }: HomeAiActivityPanelProps) {
  const [tick, setTick] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(refreshTimer);
  }, []);

  const activeJobs = useMemo(() => {
    void tick;
    try {
      const automationsSafe = normalizeAutomations(automations);
      const projectsSafe = normalizeProjects(projects);

      const runningAutomations = automationsSafe
        .filter((automation) => automation.status === "running")
        .map((automation) => automationToDashboardJob(automation, false));

      const { inProgress } = partitionProjectsForToday(projectsSafe);

      return [...runningAutomations, ...inProgress.filter(isActiveJob)];
    } catch (error) {
      console.error("[HomeAiActivityPanel]", error);
      return [];
    }
  }, [automations, projects, tick]);

  useEffect(() => {
    if (activeJobs.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % activeJobs.length);
    }, CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [activeJobs.length]);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeJobs.length]);

  const currentJob = activeJobs[activeIndex] ?? null;
  const isWorking = activeJobs.length > 0;

  return (
    <section aria-labelledby="ai-activity-heading" className="space-y-5">
      <h2
        id="ai-activity-heading"
        className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
      >
        {ui.secretaryHome.activityTitle}
      </h2>

      <div
        className={cn(
          "rounded-[28px] border px-6 py-8 sm:px-8 sm:py-10",
          isWorking
            ? "border-accent/20 bg-[var(--card)] shadow-[var(--shadow-sm)]"
            : "border-[var(--border-subtle)] bg-[var(--card)]/60",
        )}
      >
        {isWorking && currentJob ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
              </span>
              <p
                key={currentJob.id}
                className="animate-fade-in text-lg font-medium tracking-tight text-foreground sm:text-xl"
              >
                {resolveActivityLabel(currentJob.activityLabel, currentJob.title)}
              </p>
            </div>
            <p className="text-sm text-[var(--foreground-muted)]">
              {currentJob.icon} {currentJob.title}
            </p>
            {activeJobs.length > 1 && (
              <p className="text-xs text-[var(--foreground-muted)]">
                {ui.secretaryHome.activityMore(activeJobs.length - 1)}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 rounded-full bg-[var(--foreground-muted)]/40"
              aria-hidden
            />
            <p className="text-base text-[var(--foreground-muted)] sm:text-lg">
              {ui.secretaryHome.activityIdle}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
