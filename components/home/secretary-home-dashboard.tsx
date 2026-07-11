"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";

import type { Automation } from "@/lib/automations/types";
import { getTodaysAutomations } from "@/lib/automations/today";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import {
  automationToDashboardJob,
  sortAutomationJobs,
  type TodayDashboardJob,
} from "@/lib/home/today-dashboard";
import { buildSecretaryMemoryItems } from "@/lib/home/secretary-memory";
import { buildSecretaryProactiveItems } from "@/lib/home/secretary-proactive";
import { buildSecretaryVoiceBrief } from "@/lib/home/secretary-voice";
import {
  getSkippedAutomationIds,
  isAutomationSkippedToday,
} from "@/lib/home/today-skipped-store";
import { fetchNotifications } from "@/lib/notifications/client";
import type { NotificationRecord } from "@/lib/notifications/types";
import type { Project } from "@/lib/projects/types";
import { cn } from "@/lib/design-system/cn";

import { HomeTodayWorkCard } from "./home-today-work-card";
import { FrequentLearnedJobs } from "./frequent-learned-jobs";
import { SecretaryChatComposer } from "./secretary-chat-composer";
import { SecretaryMemoryPanel } from "./secretary-memory-panel";
import { SecretaryProactivePanel } from "./secretary-proactive-panel";
import { SecretaryVoiceBriefPanel } from "./secretary-voice-brief";
import { TodaysMailSection } from "./todays-mail-section";
import { TodaysCalendarSection } from "./todays-calendar-section";
import { RecentDriveSection } from "./recent-drive-section";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

const GREETING_BY_HOUR = {
  morning: "おはようございます",
  afternoon: "こんにちは",
  evening: "こんばんは",
} as const;

const FALLBACK_TODAY_JOBS: TodayDashboardJob[] = [
  {
    id: "sample-sns",
    kind: "suggestion",
    title: "SNS投稿",
    subtitle: "今日の投稿文案を準備します",
    status: "preparing",
    icon: "📱",
    scheduledTime: null,
    progress: 35,
    activityLabel: "準備中",
    href: "/workspace",
  },
  {
    id: "sample-blog",
    kind: "suggestion",
    title: "ブログ更新",
    subtitle: "下書きの整理を進めます",
    status: "not_started",
    icon: "📝",
    scheduledTime: null,
    progress: 0,
    activityLabel: null,
    href: "/workspace",
  },
  {
    id: "sample-pdf",
    kind: "suggestion",
    title: "PDF整理",
    subtitle: "資料の分類と要約を担当します",
    status: "not_started",
    icon: "📑",
    scheduledTime: null,
    progress: 0,
    activityLabel: null,
    href: "/workspace",
  },
];

function getGreetingPrefix(now = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return GREETING_BY_HOUR.morning;
  if (hour >= 11 && hour < 17) return GREETING_BY_HOUR.afternoon;
  return GREETING_BY_HOUR.evening;
}

function displayName(user: ReturnType<typeof useUser>["user"]): string {
  if (!user) return "お客様";
  const first =
    user.firstName?.trim() ||
    user.fullName?.trim()?.split(/\s+/)[0] ||
    user.username?.trim() ||
    user.primaryEmailAddress?.emailAddress?.split("@")[0];
  return first || "お客様";
}

function recentWorkItems(projects: Project[]) {
  return normalizeProjects(projects)
    .filter((project) => project.status === "completed" || project.status === "review")
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 6)
    .map((project) => ({
      id: project.id,
      title: project.title || "最近の依頼",
      href: `/projects/${project.id}`,
      meta:
        project.status === "review"
          ? "確認待ち"
          : new Date(project.updatedAt).toLocaleDateString("ja-JP"),
    }));
}

export function SecretaryHomeDashboard({
  automations,
  projects,
}: SecretaryHomeDashboardProps) {
  const { user } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const name = displayName(user);
  const greeting = `${getGreetingPrefix()}、${name}さん`;

  useEffect(() => {
    let cancelled = false;
    void fetchNotifications()
      .then((response) => {
        if (!cancelled) setNotifications(response.notifications);
      })
      .catch((error) => {
        console.error("[SecretaryHomeDashboard] Failed to load notifications:", error);
        if (!cancelled) setNotifications([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetch("/api/line/digest", { method: "POST" }).catch(() => undefined);
  }, []);

  const todayJobs = useMemo(() => {
    void refreshKey;
    try {
      const skipped = new Set(getSkippedAutomationIds());
      const jobs = getTodaysAutomations(normalizeAutomations(automations)).map(
        ({ automation }) =>
          automationToDashboardJob(
            automation,
            skipped.has(automation.id) || isAutomationSkippedToday(automation.id),
          ),
      );
      const active = sortAutomationJobs(jobs).filter(
        (job) => job.status !== "completed" && job.status !== "skipped",
      );
      return active.length > 0 ? active : FALLBACK_TODAY_JOBS;
    } catch {
      return FALLBACK_TODAY_JOBS;
    }
  }, [automations, refreshKey]);

  const proactiveItems = useMemo(
    () =>
      buildSecretaryProactiveItems({
        projects,
        automations,
        notifications,
      }),
    [automations, notifications, projects],
  );

  const voiceBrief = useMemo(
    () =>
      buildSecretaryVoiceBrief({
        projects,
        automations,
      }),
    [automations, projects],
  );

  const memoryItems = useMemo(
    () =>
      buildSecretaryMemoryItems({
        projects,
        automations,
        notifications,
      }),
    [automations, notifications, projects],
  );

  const recent = useMemo(() => recentWorkItems(projects), [projects]);
  const showingSamples = todayJobs.every((job) => job.id.startsWith("sample-"));

  return (
    <div className="home-dashboard space-y-10 pb-8 sm:space-y-12 sm:pb-12 animate-fade-up">
      <SecretaryVoiceBriefPanel brief={voiceBrief} />

      <SecretaryProactivePanel items={proactiveItems} />

      <header className="space-y-2">
        <p className="text-sm font-medium text-accent">あなた専属のAI秘書</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {greeting}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
          管理画面ではなく、AI秘書に話しかけるようにご依頼ください。
        </p>
      </header>

      <SecretaryMemoryPanel items={memoryItems} />

      <SecretaryChatComposer />

      <TodaysCalendarSection />

      <TodaysMailSection />

      <RecentDriveSection />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/teach-work"
          className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-white shadow-[var(--shadow-sm)] transition-all hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        >
          AI秘書へ仕事を教える
        </Link>
        <Link
          href="/learned-jobs"
          className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card)] px-6 text-sm font-medium text-foreground transition-colors hover:bg-[var(--background-subtle)]"
        >
          AI秘書が覚えた仕事
        </Link>
      </div>

      <FrequentLearnedJobs />

      <section aria-labelledby="secretary-recent-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2
            id="secretary-recent-heading"
            className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
          >
            最近の依頼
          </h2>
          <Link
            href="/history"
            className="text-sm text-accent transition-opacity hover:opacity-80"
          >
            すべて見る
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/40 px-6 py-8 text-center">
            <p className="text-sm text-[var(--foreground-muted)]">
              まだ依頼はありません。上の入力欄から最初の仕事を頼んでみましょう。
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recent.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                >
                  <span className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--foreground-muted)]">
                    {item.meta}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="secretary-today-heading" className="space-y-4">
        <div>
          <h2
            id="secretary-today-heading"
            className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
          >
            今日の仕事
          </h2>
          {showingSamples && (
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              習慣を登録すると、実際の担当仕事がここに表示されます。
            </p>
          )}
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {todayJobs.map((job) => (
            <li key={job.id}>
              {job.id.startsWith("sample-") ? (
                <SampleTodayCard job={job} />
              ) : (
                <HomeTodayWorkCard
                  job={job}
                  onRefresh={() => setRefreshKey((value) => value + 1)}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SampleTodayCard({ job }: { job: TodayDashboardJob }) {
  const progress = job.progress ?? 0;
  return (
    <div className="flex h-full flex-col rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          {job.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{job.title}</p>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">{job.subtitle}</p>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs text-[var(--foreground-muted)]">
          <span>進行状況</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--background-subtle)]">
          <div
            className={cn(
              "h-full rounded-full bg-accent transition-all",
              progress === 0 && "opacity-30",
            )}
            style={{ width: `${Math.max(progress, 8)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
