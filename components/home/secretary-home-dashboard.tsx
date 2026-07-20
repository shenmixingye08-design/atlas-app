"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import { normalizeProjects } from "@/lib/compatibility";
import { ui } from "@/lib/i18n";
import type { Project } from "@/lib/projects/types";

import { SecretaryUploadHero } from "./secretary-upload-hero";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

/**
 * 「AI秘書の現在状況」— 実データのみを表示する。
 * データが無い場合は上品な待機状態を表示し、架空の実績・ダミー指標は出さない。
 */
function SecretaryStatusPanel({
  automations,
  projects,
}: SecretaryHomeDashboardProps) {
  const t = ui.secretaryStatus;

  const stats = useMemo(() => {
    const normalized = normalizeProjects(projects);
    const inProgress = normalized.filter(
      (p) => p.status === "running" || p.status === "pending",
    ).length;
    const inReview = normalized.filter((p) => p.status === "review").length;
    const completed = normalized.filter((p) => p.status === "completed").length;
    const habits = automations.filter((a) => a.enabled).length;
    return { inProgress, inReview, completed, habits };
  }, [automations, projects]);

  const hasData =
    stats.inProgress + stats.inReview + stats.completed + stats.habits > 0;

  const metrics: { key: string; label: string; value: number; href?: string }[] =
    [
      { key: "inProgress", label: t.metricInProgress, value: stats.inProgress },
      {
        key: "inReview",
        label: t.metricInReview,
        value: stats.inReview,
        href: "/history",
      },
      {
        key: "completed",
        label: t.metricCompleted,
        value: stats.completed,
        href: "/history",
      },
      {
        key: "habits",
        label: t.metricHabits,
        value: stats.habits,
        href: "/automations",
      },
    ];

  return (
    <section
      aria-labelledby="secretary-status-heading"
      className="mx-auto w-full max-w-2xl space-y-4"
    >
      <h2
        id="secretary-status-heading"
        className="text-base font-semibold tracking-tight text-foreground sm:text-lg"
      >
        {t.heading}
      </h2>

      {hasData ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((metric) => {
            const body = (
              <div className="flex h-full flex-col justify-between rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
                <span className="text-2xl font-semibold tracking-tight text-accent">
                  {metric.value}
                  <span className="ml-1 text-xs font-normal text-[var(--foreground-muted)]">
                    {t.unit}
                  </span>
                </span>
                <span className="mt-2 text-xs text-[var(--foreground-muted)]">
                  {metric.label}
                </span>
              </div>
            );
            return metric.href ? (
              <Link key={metric.key} href={metric.href} className="focus-ring rounded-[20px]">
                {body}
              </Link>
            ) : (
              <div key={metric.key}>{body}</div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card)] px-6 py-10 text-center shadow-[var(--shadow-sm)]">
          <span
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] text-accent"
            aria-hidden
          >
            <span className="h-2 w-2 rounded-full bg-accent animate-soft-pulse" />
          </span>
          <p className="mt-4 text-base font-medium text-foreground">
            {t.idleTitle}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-[var(--foreground-muted)]">
            {t.idleHint}
          </p>
        </div>
      )}
    </section>
  );
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
  const recent = useMemo(() => recentWorkItems(projects), [projects]);

  return (
    <div className="home-dashboard space-y-12 pb-8 pt-2 sm:pb-12 sm:pt-6">
      <SecretaryUploadHero />

      <SecretaryStatusPanel automations={automations} projects={projects} />

      {recent.length > 0 && (
        <section
          aria-labelledby="secretary-recent-heading"
          className="mx-auto w-full max-w-2xl space-y-4"
        >
          <div className="flex items-end justify-between gap-3">
            <h2
              id="secretary-recent-heading"
              className="text-base font-semibold tracking-tight text-foreground sm:text-lg"
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
        </section>
      )}
    </div>
  );
}
