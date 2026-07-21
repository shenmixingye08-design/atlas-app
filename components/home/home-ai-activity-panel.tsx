"use client";

import { useEffect, useMemo, useState } from "react";

import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import { cn } from "@/lib/design-system/cn";
import {
  automationToDashboardJob,
  isActiveJob,
  partitionProjectsForToday,
  type TodayDashboardJob,
} from "@/lib/home/today-dashboard";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

type HomeAiActivityPanelProps = {
  automations: Automation[];
  projects: Project[];
};

type ActivityStatus =
  | "posting"
  | "image"
  | "research"
  | "email"
  | "working"
  | "completed";

const CYCLE_MS = 4000;
const REFRESH_MS = 20000;

function resolveActivityStatus(
  activityLabel: string | null,
  title: string,
): ActivityStatus {
  const haystack = `${activityLabel ?? ""} ${title}`;
  if (/画像|生成|image|イラスト|サムネ/i.test(haystack)) return "image";
  if (/調査|リサーチ|research|市場/i.test(haystack)) return "research";
  if (/メール|mail|gmail|返信/i.test(haystack)) return "email";
  if (/sns|x投稿|投稿|ツイート|tweet|ポスト/i.test(haystack)) return "posting";
  return "working";
}

function statusLabel(status: ActivityStatus): string {
  switch (status) {
    case "posting":
      return ui.secretaryHome.activityStatusPosting;
    case "image":
      return ui.secretaryHome.activityStatusImage;
    case "research":
      return ui.secretaryHome.activityStatusResearch;
    case "email":
      return ui.secretaryHome.activityStatusEmail;
    case "completed":
      return ui.secretaryHome.activityStatusCompleted;
    default:
      return ui.secretaryHome.activityStatusWorking;
  }
}

function activitySentence(status: ActivityStatus, fallback: string | null): string {
  switch (status) {
    case "posting":
      return "X投稿を作成しています";
    case "image":
      return "画像を生成しています";
    case "research":
      return "調査を進めています";
    case "email":
      return "メールを送信しています";
    case "completed":
      return "完了しました";
    default:
      return fallback?.endsWith("中")
        ? fallback.replace(/中$/, "しています")
        : fallback || "仕事を進めています";
  }
}

function toActivityRow(job: TodayDashboardJob) {
  const status = resolveActivityStatus(job.activityLabel, job.title);
  return {
    id: job.id,
    title: job.title,
    icon: job.icon,
    status,
    statusLabel: statusLabel(status),
    sentence: activitySentence(status, job.activityLabel),
  };
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

      const { inProgress, completed } = partitionProjectsForToday(projectsSafe);

      const rows = [
        ...runningAutomations,
        ...inProgress.filter(isActiveJob),
      ].map(toActivityRow);

      // Show a recent completion briefly when nothing is actively running.
      if (rows.length === 0 && completed.length > 0) {
        const latest = completed[0];
        return [
          {
            id: latest.id,
            title: latest.title,
            icon: latest.icon,
            status: "completed" as const,
            statusLabel: statusLabel("completed"),
            sentence: activitySentence("completed", null),
          },
        ];
      }

      return rows;
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
  const isWorking = activeJobs.some((job) => job.status !== "completed");

  return (
    <section aria-labelledby="ai-activity-heading" className="space-y-5">
      <div>
        <h2
          id="ai-activity-heading"
          className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          {ui.secretaryHome.activityTitle}
        </h2>
        <p className="mt-2 text-sm text-[var(--foreground-muted)] sm:text-base">
          {ui.secretaryHome.activitySubtitle}
        </p>
      </div>

      <div
        className={cn(
          "rounded-[28px] border px-6 py-8 sm:px-8 sm:py-10",
          isWorking
            ? "border-accent/20 bg-[var(--card)] shadow-[var(--shadow-sm)]"
            : "border-[var(--border-subtle)] bg-[var(--card)]/60",
        )}
      >
        {currentJob ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
                {isWorking ? (
                  <>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
                  </>
                ) : (
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--foreground-muted)]/50" />
                )}
              </span>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold tracking-wide text-accent">
                {currentJob.statusLabel}
              </span>
            </div>

            <p
              key={currentJob.id}
              className="animate-fade-in text-xl font-medium tracking-tight text-foreground sm:text-2xl"
            >
              {currentJob.sentence}
            </p>
            <p className="text-sm text-[var(--foreground-muted)] sm:text-base">
              {currentJob.icon} {currentJob.title}
            </p>

            {activeJobs.length > 1 && (
              <ul className="flex flex-wrap gap-2 pt-1" aria-label="進行中の作業一覧">
                {activeJobs.map((job, index) => (
                  <li
                    key={job.id}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs",
                      index === activeIndex
                        ? "border-accent/40 bg-accent/10 text-foreground"
                        : "border-[var(--border-subtle)] text-[var(--foreground-muted)]",
                    )}
                  >
                    {job.statusLabel}
                  </li>
                ))}
              </ul>
            )}

            {activeJobs.length > 1 && isWorking && (
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
