"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/design-system/cn";
import type { StepStatus } from "@/lib/workspace/types";
import { ProgressBar } from "@/components/ui/progress";
import { StatusChip } from "@/components/ui/status-chip";

export type TimelineStage = {
  id: string;
  icon: string;
  title: string;
  description: string;
  status: StepStatus;
  progress?: number;
  durationMs?: number;
  errorMessage?: string;
};

type WorkflowTimelineProps = {
  stages: TimelineStage[];
  className?: string;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function statusToProgress(status: StepStatus, explicit?: number): number {
  if (explicit !== undefined) return explicit;
  switch (status) {
    case "completed":
      return 100;
    case "running":
      return 55;
    case "error":
      return 100;
    default:
      return 0;
  }
}

function StageElapsedTimer({ running }: { running: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  if (!running) return null;

  return (
    <span className="text-caption tabular-nums">
      {formatDuration(elapsed)}
    </span>
  );
}

export function WorkflowTimeline({ stages, className }: WorkflowTimelineProps) {
  return (
    <div className={cn("relative", className)}>
      <div
        className="absolute left-[23px] top-8 bottom-8 w-px bg-gradient-to-b from-[var(--border)] via-accent/30 to-[var(--border)] sm:left-[27px]"
        aria-hidden="true"
      />

      <ol className="space-y-3">
        {stages.map((stage, index) => {
          const progress = statusToProgress(stage.status, stage.progress);
          const isActive = stage.status === "running";

          return (
            <li
              key={stage.id}
              className={cn(
                "relative animate-fade-up",
                index > 0 && "delay-75",
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <article
                className={cn(
                  "ml-0 flex gap-4 rounded-[var(--radius-xl)] border p-4 transition-all duration-[var(--motion-base)] sm:gap-5 sm:p-5",
                  isActive
                    ? "border-accent/30 bg-accent/5 shadow-[var(--shadow-glow)]"
                    : stage.status === "completed"
                      ? "border-[var(--border)] bg-white/[0.02]"
                      : stage.status === "error"
                        ? "border-[var(--status-error)]/25 bg-[var(--status-error-bg)]"
                        : "border-[var(--border)] bg-[var(--surface-muted)]",
                )}
              >
                <div
                  className={cn(
                    "relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-lg ring-1 sm:h-14 sm:w-14",
                    isActive
                      ? "bg-accent/15 ring-accent/40"
                      : stage.status === "completed"
                        ? "bg-[var(--status-success-bg)] ring-[var(--status-success)]/30"
                        : "bg-white/[0.04] ring-[var(--border)]",
                  )}
                >
                  {stage.icon}
                  {isActive && (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent animate-status-pulse ring-2 ring-[var(--background)]"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground sm:text-base">
                        {stage.title}
                      </h3>
                      <p className="mt-0.5 text-caption">{stage.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip status={stage.status} />
                      {stage.durationMs !== undefined &&
                        stage.status === "completed" && (
                          <span className="text-caption tabular-nums">
                            {formatDuration(stage.durationMs)}
                          </span>
                        )}
                      <StageElapsedTimer running={isActive} />
                    </div>
                  </div>

                  {(isActive || stage.status === "completed") && (
                    <div className="mt-3">
                      <ProgressBar
                        value={progress}
                        size="sm"
                        indeterminate={isActive && progress < 100}
                      />
                    </div>
                  )}

                  {stage.status === "error" && stage.errorMessage && (
                    <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-3 py-2 text-xs text-[var(--status-error)]">
                      {stage.errorMessage}
                    </p>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Map raw workflow phase states to grouped timeline stages. */
export function phasesToTimelineStages(
  phases: {
    id: string;
    label: string;
    subtitle: string;
    status: StepStatus;
    durationMs?: number;
    errorMessage?: string;
  }[],
): TimelineStage[] {
  const iconFor = (id: string, label: string): string => {
    if (id.includes("research") || label.includes("Research")) return "🔍";
    if (id.includes("planner") || label.includes("Planner")) return "📋";
    if (id.includes("worker") || label.includes("Worker")) return "⚡";
    if (id.includes("reviewer") || label.includes("Reviewer")) return "✓";
    if (id.includes("quality") || label.includes("Quality")) return "◎";
    if (id.includes("ceo") || label.includes("CEO")) return "👔";
    if (id.includes("final")) return "📦";
    return "•";
  };

  const groupMap = new Map<string, TimelineStage>();

  for (const phase of phases) {
    let groupKey: string;
    let title: string;
    let description: string;

    if (phase.id.includes("research")) {
      groupKey = "research";
      title = "Research";
      description = "外部調査と情報収集";
    } else if (phase.id.includes("planner")) {
      groupKey = "planner";
      title = "Planner";
      description = "実行計画とタスク分解";
    } else if (phase.id.includes("worker")) {
      groupKey = "workers";
      title = "Workers";
      description = phase.subtitle || "並列タスク実行";
    } else if (phase.id.includes("reviewer")) {
      groupKey = "review";
      title = "Review";
      description = "品質レビュー";
    } else if (phase.id.includes("quality")) {
      groupKey = "qa";
      title = "QA";
      description = "品質スコアリング";
    } else if (phase.id.includes("ceo")) {
      groupKey = "ceo";
      title = "CEO";
      description = phase.subtitle || "分析・最終承認";
    } else {
      groupKey = phase.id;
      title = phase.label;
      description = phase.subtitle;
    }

    const existing = groupMap.get(groupKey);
    const statusPriority: StepStatus[] = [
      "error",
      "running",
      "waiting",
      "completed",
    ];
    const mergeStatus = (a: StepStatus, b: StepStatus): StepStatus => {
      const ai = statusPriority.indexOf(a);
      const bi = statusPriority.indexOf(b);
      return ai <= bi ? a : b;
    };

    if (!existing) {
      groupMap.set(groupKey, {
        id: groupKey,
        icon: iconFor(phase.id, phase.label),
        title,
        description,
        status: phase.status,
        durationMs: phase.durationMs,
        errorMessage: phase.errorMessage,
      });
    } else {
      existing.status = mergeStatus(existing.status, phase.status);
      if (phase.durationMs) {
        existing.durationMs = (existing.durationMs ?? 0) + phase.durationMs;
      }
      if (phase.errorMessage) existing.errorMessage = phase.errorMessage;
      if (phase.status === "running") existing.status = "running";
    }
  }

  const order = ["research", "planner", "workers", "review", "qa", "ceo"];
  const result: TimelineStage[] = [];

  for (const key of order) {
    const stage = groupMap.get(key);
    if (stage) result.push(stage);
  }

  for (const [key, stage] of groupMap) {
    if (!order.includes(key)) result.push(stage);
  }

  return result;
}
