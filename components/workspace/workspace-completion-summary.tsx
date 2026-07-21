"use client";

import Link from "next/link";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { ui } from "@/lib/i18n";

type WorkspaceCompletionSummaryProps = {
  assignment: string;
  result: OrchestrationResult;
  projectId: string | null;
};

function formatDuration(totalMs: number | null | undefined): string {
  if (totalMs == null || !Number.isFinite(totalMs) || totalMs <= 0) {
    return ui.secretaryResult.durationUnknown;
  }
  const totalSeconds = Math.max(1, Math.round(totalMs / 1000));
  if (totalSeconds < 60) {
    return ui.secretaryResult.durationSeconds(totalSeconds);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return ui.secretaryResult.durationMinutes(minutes, seconds);
}

export function WorkspaceCompletionSummary({
  assignment,
  result,
  projectId,
}: WorkspaceCompletionSummaryProps) {
  const deliverableTitle =
    result.deliverable?.title?.trim() ||
    result.finalResponse?.trim().slice(0, 80) ||
    "成果物";
  const deliverableHref = projectId
    ? `/projects/${encodeURIComponent(projectId)}`
    : null;

  return (
    <section
      aria-label={ui.secretaryResult.workDoneHeading}
      className="space-y-5 rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] px-6 py-7 shadow-[var(--shadow-sm)] sm:px-8"
    >
      <div className="space-y-2">
        <h2 className="text-sm font-medium tracking-wide text-accent">
          {ui.secretaryResult.workDoneHeading}
        </h2>
        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground sm:text-lg">
          {assignment.trim() || deliverableTitle}
        </p>
      </div>

      <dl className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-xs text-[var(--foreground-muted)]">
            {ui.secretaryResult.deliverableHeading}
          </dt>
          <dd className="text-base font-medium text-foreground">
            {deliverableTitle}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs text-[var(--foreground-muted)]">
            {ui.secretaryResult.deliverableLinkHeading}
          </dt>
          <dd>
            {deliverableHref ? (
              <Link
                href={deliverableHref}
                className="text-base font-medium text-accent underline-offset-4 hover:underline"
              >
                {ui.secretaryResult.openDeliverable}
              </Link>
            ) : (
              <span className="text-base text-[var(--foreground-muted)]">—</span>
            )}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs text-[var(--foreground-muted)]">
            {ui.secretaryResult.usedAiHeading}
          </dt>
          <dd className="text-base text-foreground">
            {ui.secretaryResult.usedAiDefault}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs text-[var(--foreground-muted)]">
            {ui.secretaryResult.durationHeading}
          </dt>
          <dd className="text-base text-foreground">
            {formatDuration(result.totalDurationMs)}
          </dd>
        </div>
      </dl>

      <div className="space-y-2 border-t border-[var(--border-subtle)] pt-5">
        <h3 className="text-sm font-medium tracking-wide text-accent">
          {ui.secretaryResult.nextRecommendHeading}
        </h3>
        <p className="text-base text-foreground">
          {ui.secretaryResult.nextRecommendHint}
        </p>
        <ButtonResetHint />
      </div>
    </section>
  );
}

function ButtonResetHint() {
  return (
    <p className="text-sm text-[var(--foreground-muted)]">
      下の「新しい依頼」から、よく使うテンプレートで続けられます。
    </p>
  );
}
