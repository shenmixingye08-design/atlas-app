"use client";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";
import type { OrchestrationResult } from "@/lib/orchestration/types";

type QualityMemorySummaryProps = {
  result: OrchestrationResult | null | undefined;
};

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "completed":
      return ui.qualityMemorySummary.statusCompleted;
    case "needs_review":
      return ui.qualityMemorySummary.statusNeedsReview;
    case "waiting_for_user":
      return ui.qualityMemorySummary.statusWaiting;
    case "failed":
      return ui.qualityMemorySummary.statusFailed;
    case "revising":
      return ui.qualityMemorySummary.statusRevising;
    case "reviewing":
      return ui.qualityMemorySummary.statusReviewing;
    case "processing":
      return ui.qualityMemorySummary.statusProcessing;
    default:
      return ui.qualityMemorySummary.statusUnknown;
  }
}

/**
 * User-facing quality + memory summary (no internal pipeline jargon).
 */
export function QualityMemorySummary({ result }: QualityMemorySummaryProps) {
  if (!result) return null;

  const deliveryStatus =
    result.deliveryStatus ?? result.qualityLoop?.deliveryStatus;
  const score =
    result.qualityAssurance?.overallScore ??
    result.qualityLoop?.enhancedScore ??
    result.qualityLoop?.currentScore ??
    null;
  const revisionCount =
    result.qualityAssurance?.revisionCount ??
    result.qualityLoop?.revisionCount ??
    0;
  const majorErrors =
    result.qualityAssurance?.majorErrors ??
    result.qualityLoop?.majorErrors ??
    [];
  const assumptions = result.hierarchicalMemory?.assumptions ?? [];
  const usedCount = result.hierarchicalMemory?.usedIds.length ?? 0;
  const savedCount = result.hierarchicalMemory?.savedIds.length ?? 0;
  const missingQuestions = result.missingInfo?.questions ?? [];

  const hasAnything =
    deliveryStatus != null ||
    score != null ||
    revisionCount > 0 ||
    usedCount > 0 ||
    savedCount > 0 ||
    assumptions.length > 0 ||
    missingQuestions.length > 0 ||
    majorErrors.length > 0;

  if (!hasAnything) return null;

  return (
    <Card padding="lg" className="space-y-3 shadow-[var(--shadow-soft)] sm:col-span-2">
      <p className="text-xs font-semibold tracking-wide text-accent">
        {ui.qualityMemorySummary.heading}
      </p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {deliveryStatus ? (
          <div>
            <dt className="text-[var(--foreground-muted)]">
              {ui.qualityMemorySummary.qualityStatus}
            </dt>
            <dd className="font-medium text-foreground">
              {statusLabel(deliveryStatus)}
            </dd>
          </div>
        ) : null}
        {score != null ? (
          <div>
            <dt className="text-[var(--foreground-muted)]">
              {ui.qualityMemorySummary.score}
            </dt>
            <dd className="font-medium text-foreground">{score}/100</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[var(--foreground-muted)]">
            {ui.qualityMemorySummary.revisions}
          </dt>
          <dd className="font-medium text-foreground">{revisionCount}</dd>
        </div>
        <div>
          <dt className="text-[var(--foreground-muted)]">
            {ui.qualityMemorySummary.usedMemory}
          </dt>
          <dd className="font-medium text-foreground">
            {ui.qualityMemorySummary.countItems(usedCount)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--foreground-muted)]">
            {ui.qualityMemorySummary.savedMemory}
          </dt>
          <dd className="font-medium text-foreground">
            {ui.qualityMemorySummary.countItems(savedCount)}
          </dd>
        </div>
      </dl>

      {majorErrors.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[var(--foreground-muted)]">
            {ui.qualityMemorySummary.needsAttention}
          </p>
          <ul className="list-inside list-disc text-sm text-foreground">
            {majorErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {assumptions.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[var(--foreground-muted)]">
            {ui.qualityMemorySummary.assumptions}
          </p>
          <ul className="list-inside list-disc text-sm text-[var(--foreground-muted)]">
            {assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {missingQuestions.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[var(--foreground-muted)]">
            {ui.qualityMemorySummary.missingQuestions}
          </p>
          <ul className="list-inside list-disc text-sm text-foreground">
            {missingQuestions.map((q) => (
              <li key={q.id}>{q.question}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.hierarchicalMemory?.promptPreview ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          {ui.qualityMemorySummary.temporaryNote}
        </p>
      ) : null}
    </Card>
  );
}
