"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import { normalizeProjects } from "@/lib/compatibility";
import type { Project } from "@/lib/projects/types";

import { SecretaryUploadHero } from "./secretary-upload-hero";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

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
  projects,
}: SecretaryHomeDashboardProps) {
  const recent = useMemo(() => recentWorkItems(projects), [projects]);

  return (
    <div className="home-dashboard space-y-12 pb-8 pt-2 sm:pb-12 sm:pt-6">
      <SecretaryUploadHero />

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
