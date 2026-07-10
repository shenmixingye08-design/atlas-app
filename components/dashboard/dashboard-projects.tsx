"use client";

import Link from "next/link";

import type { Project } from "@/lib/projects/types";
import {
  getProjectDeliverableHint,
  getProjectDepartmentLabel,
  getProjectQualityScore,
} from "@/lib/dashboard/utils";
import { ui } from "@/lib/i18n";
import { formatProjectDate } from "@/lib/projects/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

type DashboardProjectsProps = {
  projects: Project[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onDelete: (id: string) => void;
};

export function DashboardProjects({
  projects,
  searchQuery,
  onSearchChange,
  onDelete,
}: DashboardProjectsProps) {
  return (
    <section aria-labelledby="projects-heading" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="projects-heading" className="text-title text-foreground">
            {ui.nav.projects}
          </h2>
          <p className="mt-1 text-caption">{ui.marketplace.presets(projects.length)}</p>
        </div>
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={ui.project.searchPlaceholder}
          aria-label={ui.project.searchPlaceholder}
          className="sm:max-w-xs"
        />
      </div>

      {projects.length === 0 ? (
        <Card variant="elevated">
          <EmptyState
            icon="📁"
            title={ui.project.empty}
            description={
              searchQuery ? ui.project.searchPlaceholder : ui.project.emptyHint
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {projects.map((project, index) => {
            const quality = getProjectQualityScore(project);
            const department = getProjectDepartmentLabel(project);
            const deliverables = getProjectDeliverableHint(project);

            return (
              <Card
                key={project.id}
                variant="interactive"
                padding="lg"
                className="animate-fade-up"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-foreground">
                    {project.title}
                  </h3>
                  {quality !== null && (
                    <Badge variant={quality >= 90 ? "success" : "accent"}>
                      QA {quality}%
                    </Badge>
                  )}
                </div>

                <p className="mt-2 line-clamp-2 text-sm text-[var(--foreground-muted)]">
                  {project.workRequest}
                </p>

                <div className="mt-5">
                  <ProgressBar value={project.progress} size="md" showLabel />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-3 py-2 ring-1 ring-[var(--border)]">
                    <p className="text-overline">{ui.project.department}</p>
                    <p className="mt-1 text-sm font-medium">{department}</p>
                  </div>
                  <div className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-3 py-2 ring-1 ring-[var(--border)]">
                    <p className="text-overline">{ui.nav.deliverables}</p>
                    <p className="mt-1 text-sm font-medium">{deliverables}</p>
                  </div>
                  <div className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-3 py-2 ring-1 ring-[var(--border)]">
                    <p className="text-overline">{ui.project.created}</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatProjectDate(project.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Link href={`/projects/${project.id}`}>
                    <Button variant="primary" size="sm">
                      {ui.actions.open}
                    </Button>
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDelete(project.id)}
                    className="text-xs text-[var(--foreground-subtle)] transition-colors hover:text-[var(--status-error)] focus-ring rounded px-2 py-1"
                  >
                    {ui.actions.delete}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
