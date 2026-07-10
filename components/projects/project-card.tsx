"use client";

import Link from "next/link";

import { formatProjectDate, formatRelativeDate } from "@/lib/projects/utils";
import type { Project } from "@/lib/projects/types";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";

import { EmployeeBadges } from "./employee-badges";
import { ProjectStatusBadge } from "./project-status-badge";

type ProjectCardProps = {
  project: Project;
  onDelete: (id: string) => void;
};

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm(`「${project.title}」を削除しますか？`)) {
      onDelete(project.id);
    }
  };

  return (
    <Link href={`/projects/${project.id}`} className="group block h-full">
      <Card
        variant="interactive"
        padding="md"
        className="h-full"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-[var(--accent-hover)] sm:text-lg">
            {project.title}
          </h3>
          <ProjectStatusBadge status={project.status} />
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-[var(--foreground-muted)]">
          {project.workRequest}
        </p>

        <div className="mt-5">
          <ProgressBar value={project.progress} size="sm" showLabel />
        </div>

        <div className="mt-4">
          <EmployeeBadges employees={project.assignedEmployees} />
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4 text-caption">
          <span>作成: {formatProjectDate(project.createdAt)}</span>
          <span>更新: {formatRelativeDate(project.updatedAt)}</span>
        </div>

        <button
          type="button"
          onClick={handleDelete}
          className="mt-3 text-xs text-[var(--foreground-subtle)] transition-colors hover:text-[var(--status-error)] focus-ring rounded"
        >
          削除
        </button>
      </Card>
    </Link>
  );
}
