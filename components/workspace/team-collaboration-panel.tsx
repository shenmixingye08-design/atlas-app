"use client";

import type { TeamCollaborationSnapshot } from "@/lib/team-collaboration";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

import {
  WorkflowTimeline,
  type TimelineStage,
} from "./workflow-timeline";

type TeamCollaborationPanelProps = {
  snapshot: TeamCollaborationSnapshot;
  className?: string;
};

function toTimelineStages(snapshot: TeamCollaborationSnapshot): TimelineStage[] {
  return snapshot.stages.map((stage) => ({
    id: stage.id,
    icon: stage.icon,
    title: stage.employeeName
      ? `${stage.title} · ${ui.teamCollaboration.assignedTo(stage.employeeName)}`
      : stage.title,
    description: [
      stage.description,
      stage.dependsOn?.length ? ui.teamCollaboration.dependsOn(stage.dependsOn.join(" → ")) : null,
      stage.reassigned ? ui.teamCollaboration.reassigned : null,
    ]
      .filter(Boolean)
      .join(" · "),
    status: stage.status,
    durationMs: stage.durationMs,
    errorMessage: stage.errorMessage,
  }));
}

export function TeamCollaborationPanel({
  snapshot,
  className,
}: TeamCollaborationPanelProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {snapshot.handoffs.length > 0 && (
        <Card padding="lg" className="landing-glass space-y-4 shadow-[var(--shadow-soft)]">
          <div>
            <h3 className="text-title text-foreground">{ui.teamCollaboration.handoffsTitle}</h3>
            <p className="mt-1 text-caption text-[var(--foreground-muted)]">
              {ui.teamCollaboration.panelHint}
            </p>
          </div>
          <ul className="space-y-3">
            {snapshot.handoffs.map((handoff, index) => (
              <li
                key={`${handoff.fromEmployeeId}-${handoff.toEmployeeId}-${index}`}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{handoff.fromEmployeeName}</span>
                  <span className="text-[var(--text-muted)]" aria-hidden>
                    →
                  </span>
                  <span className="font-medium text-accent">{handoff.toEmployeeName}</span>
                  <StatusChip status="completed" label={handoff.taskTitle} />
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{handoff.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="space-y-4">
        <h3 className="text-title text-foreground">{ui.teamCollaboration.timelineTitle}</h3>
        <WorkflowTimeline stages={toTimelineStages(snapshot)} />
      </section>
    </div>
  );
}
