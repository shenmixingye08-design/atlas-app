"use client";

import { useMemo } from "react";

import type { Project } from "@/lib/projects/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/design-system/cn";

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: StatCardProps) {
  return (
    <Card
      variant="elevated"
      padding="md"
      className={cn("animate-fade-up transition-all hover:border-[var(--border-strong)]", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-overline">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          {hint && <p className="mt-1 text-caption">{hint}</p>}
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--surface-muted)] text-lg ring-1 ring-[var(--border)]">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function useDashboardStats(projects: Project[]) {
  return useMemo(() => {
    const todayUpdated = projects.filter((p) => isToday(p.updatedAt));
    const running = projects.filter((p) => p.status === "running");
    const completedToday = projects.filter(
      (p) => p.status === "completed" && isToday(p.updatedAt),
    );

    const qualityScores = projects
      .map((p) => p.result?.qualityLoop?.currentScore)
      .filter((s): s is number => typeof s === "number");

    const avgQuality =
      qualityScores.length > 0
        ? Math.round(
            qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length,
          )
        : null;

    const recentActivity = [...projects]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 5);

    return {
      todayWork: todayUpdated.length,
      runningCount: running.length,
      completedToday: completedToday.length,
      avgQuality,
      recentActivity,
    };
  }, [projects]);
}
