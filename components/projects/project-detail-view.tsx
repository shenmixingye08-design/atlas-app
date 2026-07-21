"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { Project } from "@/lib/projects/types";
import { fetchProjectById } from "@/lib/projects/client";
import {
  notFoundDisplayState,
  resolveDeliverableDisplayState,
  type DeliverableDisplayState,
} from "@/lib/projects/deliverable-state";
import { useProjects } from "@/lib/projects/use-projects";
import { ui } from "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionHeader } from "@/components/ui/section-header";

import { DeliverableResultView } from "./deliverable-result-view";
import { DeliverableStateNotice } from "./deliverable-state-notice";
import { ProjectStatusBadge } from "./project-status-badge";

type ProjectDetailViewProps = {
  projectId: string;
};

type ServerLookup =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; project: Project | null; missing: boolean };

export function ProjectDetailView({ projectId }: ProjectDetailViewProps) {
  const router = useRouter();
  const { getProject, removeProject, isReady } = useProjects();
  const clientProject = getProject(projectId);
  const [server, setServer] = useState<ServerLookup>({ phase: "idle" });

  // When the local cache has no copy (other device / cold start /
  // server-triggered run), resolve the exact 成果物 from the durable store so
  //「結果を見る」never dead-ends.
  useEffect(() => {
    if (!isReady || clientProject || server.phase !== "idle") return;

    let cancelled = false;
    setServer({ phase: "loading" });

    void fetchProjectById(projectId).then((result) => {
      if (cancelled) return;
      if (result.status === "found") {
        setServer({ phase: "done", project: result.project, missing: false });
      } else if (result.status === "not_found") {
        setServer({ phase: "done", project: null, missing: true });
      } else {
        // unavailable / unauthorized / error — no durable answer.
        setServer({ phase: "done", project: null, missing: false });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isReady, clientProject, projectId, server.phase]);

  const project =
    clientProject ?? (server.phase === "done" ? server.project : null);

  if (!isReady || (!clientProject && server.phase === "loading")) {
    return <LoadingState />;
  }

  if (!project) {
    // Confirmed durable miss, or no durable backend and no local copy.
    const state: DeliverableDisplayState = notFoundDisplayState();
    return (
      <div className="space-y-8">
        <Link
          href="/history"
          className="inline-flex items-center gap-1 text-sm text-[var(--foreground-muted)] transition-colors hover:text-foreground focus-ring rounded"
        >
          ← {ui.nav.history}
        </Link>
        <DeliverableStateNotice state={state} />
      </div>
    );
  }

  const displayState = resolveDeliverableDisplayState(project);
  const isLocal = Boolean(clientProject);

  const handleDelete = () => {
    if (!isLocal) return;
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
            {isLocal && (
              <Button variant="danger" size="sm" onClick={handleDelete}>
                {ui.actions.remove}
              </Button>
            )}
          </div>
        }
      />

      {displayState.kind === "ready" ? (
        <DeliverableResultView project={project} />
      ) : (
        <DeliverableStateNotice state={displayState} />
      )}
    </div>
  );
}
