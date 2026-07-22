"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { projectService } from "@/lib/projects/project-service";
import { filterCompletedDeliverableProjects } from "@/lib/deliverables/completed-filter";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

export function DeliverablesListPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setProjects(projectService.list());
    setLoading(false);
  }, []);

  if (loading) return <LoadingState message={ui.phase3.deliverablesLoading} />;

  const withResults = filterCompletedDeliverableProjects(projects);

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent">{ui.brand}</p>
        <h1 className="text-display text-foreground">{ui.nav.deliverables}</h1>
        <p className="text-body text-[var(--foreground-muted)]">
          {ui.phase3.deliverablesSubtitle}
        </p>
      </header>

      {withResults.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="text-foreground">{ui.phase3.deliverablesEmpty}</p>
          <Link
            href="/workspace"
            className="mt-4 inline-flex min-h-[44px] items-center text-accent underline-offset-2 hover:underline"
          >
            {ui.phase3.primaryCtaRequest}
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3">
          {withResults.slice(0, 30).map((project) => (
            <li key={project.id}>
              <Link href={`/projects/${project.id}`}>
                <Card
                  padding="md"
                  className="transition-colors hover:border-accent/30"
                >
                  <p className="font-medium text-foreground">{project.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--foreground-muted)]">
                    {project.workRequest ?? "—"}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
