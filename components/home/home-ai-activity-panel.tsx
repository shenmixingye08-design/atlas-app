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

type ActivityKind =
  | "posting"
  | "image"
  | "research"
  | "email"
  | "working"
  | "completed";

const CYCLE_MS = 4000;
const REFRESH_MS = 20000;

function resolveActivityKind(activityLabel: string | null, title: string): ActivityKind {
  const haystack = `${activityLabel ?? ""} ${title}`;
  if (/画像|image|生成/i.test(haystack)) return "image";
  if (/調査|research|リサーチ|市場/i.test(haystack)) return "research";
  if (/メール|mail|gmail|送信/i.test(haystack)) return "email";
  if (/sns|x投稿|投稿|tweet|ポスト/i.test(haystack)) return "posting";
  if (/完了|completed|done/i.test(haystack)) return "completed";
  return "working";
}

function activityStatusLabel(kind: ActivityKind): string {
  switch (kind) {
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

function resolveActivitySentence(
  activityLabel: string | null,
  title: string,
  kind: ActivityKind,
): string {
  if (activityLabel?.trim()) {
    if (activityLabel.endsWith("中")) {
      return activityLabel.replace(/中$/, "しています");
    }
    if (activityLabel.endsWith("しています") || activityLabel.endsWith("しました")) {
      return activityLabel;
    }
  }

  switch (kind) {
    case "posting":
      return "投稿を進めています";
    case "image":
      return "画像を生成しています";
    case "research":
      return "調査を進めています";
    case "email":
      return "メールを送信しています";
    case "completed":
      return "作業が完了しました";
    default:
      return "仕事を進めています";
  }
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

  const recentlyCompleted = useMemo(() => {
    void tick;
    try {
      const projectsSafe = normalizeProjects(projects);
      return projectsSafe
        .filter((project) => project.status === "completed")
        .slice(0, 3)
        .map((project) => ({
          id: project.id,
          title: project.title,
          kind: "completed" as const,
        }));
    } catch {
      return [];
    }
  }, [projects, tick]);

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
  const currentKind = currentJob
    ? resolveActivityKind(currentJob.activityLabel, currentJob.title)
    : null;

  return (
    <section aria-labelledby="ai-activity-heading" className="space-y-5">
      <div>
        <h2
          id="ai-activity-heading"
          className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
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
        {isWorking && currentJob && currentKind ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
              </span>
              <span className="rounded-full bg-[var(--accent-muted)] px-3 py-1 text-xs font-semibold tracking-wide text-accent">
                {activityStatusLabel(currentKind)}
              </span>
            </div>
            <p
              key={currentJob.id}
              className="animate-fade-in text-lg font-medium tracking-tight text-foreground sm:text-xl"
            >
              {resolveActivitySentence(
                currentJob.activityLabel,
                currentJob.title,
                currentKind,
              )}
            </p>
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
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full bg-[var(--foreground-muted)]/40"
                aria-hidden
              />
              <p className="text-base text-[var(--foreground-muted)] sm:text-lg">
                {ui.secretaryHome.activityIdle}
              </p>
            </div>
            {recentlyCompleted.length > 0 && (
              <ul className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
                {recentlyCompleted.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-foreground">{item.title}</span>
                    <span className="shrink-0 rounded-full bg-[var(--success-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--success)]">
                      {ui.secretaryHome.activityStatusCompleted}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
