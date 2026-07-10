"use client";

import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import { computeMonthlyAchievements } from "@/lib/home/monthly-achievements";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

type HomeMonthlyAchievementsProps = {
  projects: Project[];
  automations: Automation[];
  embedded?: boolean;
};

export function HomeMonthlyAchievements({
  projects,
  automations,
  embedded = false,
}: HomeMonthlyAchievementsProps) {
  const stats = useMemo(() => {
    try {
      return computeMonthlyAchievements(projects ?? [], automations ?? []);
    } catch (error) {
      console.error("[HomeMonthlyAchievements]", error);
      return {
        monthLabel: new Date().toLocaleDateString("ja-JP", {
          year: "numeric",
          month: "long",
        }),
        snsPosts: 0,
        blogPosts: 0,
        salesMaterials: 0,
        emailReplies: 0,
        hoursSaved: 0,
      };
    }
  }, [projects, automations]);

  const rows = [
    { label: "SNS投稿", count: stats.snsPosts },
    { label: "ブログ", count: stats.blogPosts },
    { label: "営業資料", count: stats.salesMaterials },
    { label: "メール返信", count: stats.emailReplies },
  ];

  const hasActivity = rows.some((row) => row.count > 0);

  if (!hasActivity) {
    return null;
  }

  return (
    <section
      aria-labelledby={embedded ? undefined : "monthly-achievements-heading"}
      className={embedded ? "space-y-4" : "space-y-5"}
    >
      {!embedded && (
        <h2 id="monthly-achievements-heading" className="text-xl font-semibold text-foreground">
          {ui.todayDashboard.monthlyTitle}
        </h2>
      )}
      <Card padding="lg" className="space-y-6 shadow-[var(--shadow-sm)]">
        <p className="text-sm text-[var(--foreground-muted)]">{stats.monthLabel}</p>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {rows.map((row) => (
            <div
              key={row.label}
              className="rounded-[var(--radius-xl)] bg-[var(--background-subtle)] px-4 py-4"
            >
              <dt className="text-sm text-[var(--foreground-muted)]">{row.label}</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {ui.todayDashboard.monthlyCount(row.count)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-base font-medium text-foreground">
          {ui.todayDashboard.monthlyHoursSaved(stats.hoursSaved)}
        </p>
      </Card>
    </section>
  );
}
