"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatProjectDate, formatRelativeDate } from "@/lib/projects/utils";
import type { Project } from "@/lib/projects/types";
import { useProjects } from "@/lib/projects/use-projects";
import { ui } from "@/lib/i18n";

import { FinalOutput } from "@/components/workspace/final-output";
import { useDeliverableFiles } from "@/lib/workspace/use-deliverable-files";
import { PrReviewPanel } from "@/components/workspace/pr-review-panel";
import { GrowthReviewPanel } from "@/components/workspace/growth-review-panel";
import { CompanyLearningPanel } from "@/components/workspace/company-learning-panel";
import { CompanyOperationsPanel } from "@/components/workspace/company-operations-panel";
import { ActionEnginePanel } from "@/components/workspace/action-engine-panel";
import { WorkflowInspectorPanel } from "@/components/workspace/workflow-inspector-panel";
import { WorkflowResults } from "@/components/workspace/workflow-results";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionHeader } from "@/components/ui/section-header";

import { EmployeeBadges } from "./employee-badges";
import { ProgressBar } from "./progress-bar";
import { ProjectStatusBadge } from "./project-status-badge";
import { WorkflowTimeline } from "./workflow-timeline";

type ProjectDetailViewProps = {
  projectId: string;
};

export function ProjectDetailView({ projectId }: ProjectDetailViewProps) {
  const router = useRouter();
  const { getProject, removeProject, isReady } = useProjects();
  const project = getProject(projectId);
  const { deliverables, deliverablesError, isGeneratingDeliverables } =
    useDeliverableFiles(project?.result ?? null);

  if (!isReady) {
    return <LoadingState />;
  }

  if (!project) {
    return (
      <EmptyState
        icon="📁"
        title={ui.project.notFound}
        action={
          <Link href="/projects">
            <Button variant="secondary">← {ui.project.backToList}</Button>
          </Link>
        }
      />
    );
  }

  const handleDelete = () => {
    if (window.confirm(`「${project.title}」を削除しますか？`)) {
      removeProject(project.id);
      router.push("/projects");
    }
  };

  return (
    <div className="space-y-8">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-[var(--foreground-muted)] transition-colors hover:text-foreground focus-ring rounded"
      >
        ← {ui.project.backToList}
      </Link>

      <SectionHeader
        title={project.title}
        action={
          <div className="flex flex-wrap gap-2">
            <ProjectStatusBadge status={project.status} />
            {project.status === "pending" && (
              <Link href={`/workspace?project=${project.id}`}>
                <Button variant="primary" size="sm">
                  {ui.project.runInWorkspace}
                </Button>
              </Link>
            )}
            <Button variant="danger" size="sm" onClick={handleDelete}>
              {ui.actions.remove}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-4 text-caption">
        <span>
          {ui.project.created}: {formatProjectDate(project.createdAt)}
        </span>
        <span>
          {ui.project.updated}: {formatRelativeDate(project.updatedAt)}
        </span>
      </div>

      <ProgressBar progress={project.progress} />
      <EmployeeBadges employees={project.assignedEmployees} />

      <Card padding="md">
        <h2 className="text-overline mb-3">{ui.project.workRequest}</h2>
        <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
          {project.workRequest}
        </p>
      </Card>

      <WorkflowTimeline project={project} />

      {project.result ? (
        <>
          <FinalOutput
            result={project.result}
            isLoading={false}
            deliverables={deliverables}
            isGeneratingDeliverables={isGeneratingDeliverables}
            deliverablesError={deliverablesError}
          />
          <WorkflowResults
            result={project.result}
            loadingPhases={[]}
            isLoading={false}
            error={project.error ?? null}
          />
          <PrReviewPanel
            result={project.result}
            showGrowthReview={false}
            showCompanyLearning={false}
          />
          <GrowthReviewPanel result={project.result} />
          <CompanyLearningPanel result={project.result} />
          <CompanyOperationsPanel result={project.result} />
          <ActionEnginePanel result={project.result} />
          <WorkflowInspectorPanel result={project.result} />
        </>
      ) : (
        <Card variant="elevated">
          <EmptyState
            icon="⚡"
            title={
              project.status === "pending"
                ? ui.project.pendingRun
                : ui.project.noResults
            }
            description={
              project.status === "pending"
                ? ui.project.pendingRunHint
                : undefined
            }
          />
        </Card>
      )}
    </div>
  );
}
