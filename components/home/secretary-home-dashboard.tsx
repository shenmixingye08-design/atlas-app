"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useMemo, useState } from "react";

import type { Automation } from "@/lib/automations/types";
import { getTodaysAutomations } from "@/lib/automations/today";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import {
  automationToDashboardJob,
  sortAutomationJobs,
  type TodayDashboardJob,
} from "@/lib/home/today-dashboard";
import {
  getSkippedAutomationIds,
  isAutomationSkippedToday,
} from "@/lib/home/today-skipped-store";
import type { Project } from "@/lib/projects/types";
import { cn } from "@/lib/design-system/cn";

import { HomeTodayWorkCard } from "./home-today-work-card";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

const GREETING_BY_HOUR = {
  morning: "おはようございます",
  afternoon: "こんにちは",
  evening: "こんばんは",
} as const;

const REQUEST_ACTIONS = [
  { id: "photo", icon: "📷", label: "写真を追加", href: "/workspace?attach=photo" },
  { id: "pdf", icon: "📄", label: "PDFを追加", href: "/workspace?attach=pdf" },
  { id: "video", icon: "🎬", label: "動画を追加", href: "/workspace?attach=video" },
  { id: "file", icon: "📁", label: "資料を追加", href: "/workspace?attach=file" },
  { id: "text", icon: "✍️", label: "文章を追加", href: "/workspace?attach=text" },
] as const;

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
  {
    id: "sample-mail",
    kind: "suggestion",
    title: "メール返信",
    subtitle: "返信文案をご用意します",
    status: "not_started",
    icon: "✉️",
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

function buildSecretaryNotices(
  automations: Automation[],
  projects: Project[],
): { id: string; message: string }[] {
  const notices: { id: string; message: string }[] = [];
  const hasBlog = automations.some((item) =>
    /blog|ブログ/i.test(`${item.name} ${item.workflow?.assignment ?? ""}`),
  );
  const hasSns = automations.some((item) =>
    /sns|投稿|x\b|instagram/i.test(`${item.name} ${item.workflow?.assignment ?? ""}`),
  );
  const reviewCount = projects.filter((project) => project.status === "review").length;
  const runningCount = projects.filter((project) => project.status === "running").length;

  if (!hasBlog) {
    notices.push({
      id: "blog-gap",
      message: "ブログを3日更新していません。下書き作成をご依頼いただけます。",
    });
  }
  if (hasSns) {
    notices.push({
      id: "sns-timing",
      message: "投稿時間を変更すると、反応率が上がる可能性があります。",
    });
  }
  if (reviewCount > 0) {
    notices.push({
      id: "review",
      message: `確認待ちの仕事が${reviewCount}件あります。ご確認をお願いいたします。`,
    });
  } else if (runningCount === 0) {
    notices.push({
      id: "materials",
      message: "資料が不足している場合は、写真やPDFを追加してください。",
    });
  }
  notices.push({
    id: "improve",
    message: "改善案があります。最近の仕事をもとに、進め方をご提案できます。",
  });

  return notices.slice(0, 4);
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
      title: project.title || "最近の仕事",
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
  const name = displayName(user);
  const greeting = `${getGreetingPrefix()}、${name}さん`;

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

  const notices = useMemo(
    () => buildSecretaryNotices(automations, projects),
    [automations, projects],
  );
  const recent = useMemo(() => recentWorkItems(projects), [projects]);
  const showingSamples = todayJobs.every((job) => job.id.startsWith("sample-"));

  return (
    <div className="home-dashboard space-y-12 pb-8 sm:pb-12 animate-fade-up">
      <header className="space-y-3">
        <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {greeting}
        </p>
        <p className="text-base text-[var(--foreground-muted)] sm:text-lg">
          あなた専属のAI秘書が、今日の仕事を進めています。
        </p>
      </header>

      <section aria-labelledby="secretary-today-heading" className="space-y-5">
        <div>
          <h2
            id="secretary-today-heading"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            今日AI秘書が担当する仕事
          </h2>
          {showingSamples && (
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              習慣を登録すると、実際の担当仕事がここに表示されます。
            </p>
          )}
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
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

      <section aria-labelledby="secretary-request-heading" className="space-y-5">
        <div>
          <h2
            id="secretary-request-heading"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            新しい依頼
          </h2>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            送るだけで、AI秘書が仕事を進めます。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {REQUEST_ACTIONS.map((action) => (
            <Link
              key={action.id}
              href={action.href}
              className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-6 text-center shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              <span className="text-3xl" aria-hidden>
                {action.icon}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="secretary-notices-heading" className="space-y-5">
        <h2
          id="secretary-notices-heading"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          AI秘書からのお知らせ
        </h2>
        <ul className="space-y-3">
          {notices.map((notice) => (
            <li
              key={notice.id}
              className="rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-sm)]"
            >
              <p className="text-sm leading-relaxed text-foreground">
                {notice.message}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="secretary-recent-heading" className="space-y-5">
        <h2
          id="secretary-recent-heading"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          最近の仕事
        </h2>
        {recent.length === 0 ? (
          <div className="rounded-[var(--radius-2xl)] border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/50 px-6 py-10 text-center">
            <p className="text-sm text-[var(--foreground-muted)]">
              まだ最近の仕事はありません。上からご依頼ください。
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recent.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--background-subtle)]/60"
                >
                  <span className="text-sm font-medium text-foreground">
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
    </div>
  );
}

function SampleTodayCard({ job }: { job: TodayDashboardJob }) {
  const progress = job.progress ?? 0;
  return (
    <div className="flex h-full flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
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
