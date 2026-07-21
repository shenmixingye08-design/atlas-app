"use client";

import Link from "next/link";

import type { CompletionSummary } from "@/lib/results/completion-summary";
import { ui } from "@/lib/i18n";

type CompletionSummaryCardProps = {
  summary: CompletionSummary;
};

export function CompletionSummaryCard({ summary }: CompletionSummaryCardProps) {
  return (
    <section
      aria-label={ui.secretaryResult.workDoneHeading}
      className="space-y-5 rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] px-6 py-7 shadow-[var(--shadow-sm)] sm:px-8 sm:py-8"
    >
      <div className="space-y-2">
        <h2 className="text-sm font-medium tracking-wide text-accent">
          {ui.secretaryResult.workDoneHeading}
        </h2>
        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground sm:text-lg">
          {summary.workDone}
        </p>
      </div>

      <dl className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-xs text-[var(--foreground-muted)]">
            {ui.secretaryResult.deliverableHeading}
          </dt>
          <dd className="text-base font-medium text-foreground">
            {summary.deliverableTitle}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="text-xs text-[var(--foreground-muted)]">
            {ui.secretaryResult.deliverableLinkHeading}
          </dt>
          <dd>
            {summary.deliverableHref ? (
              <Link
                href={summary.deliverableHref}
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
          <dd className="text-base text-foreground">{summary.usedAi}</dd>
        </div>

        <div className="space-y-1">
          <dt className="text-xs text-[var(--foreground-muted)]">
            {ui.secretaryResult.durationHeading}
          </dt>
          <dd className="text-base text-foreground">{summary.durationLabel}</dd>
        </div>
      </dl>

      {summary.failureReason && (
        <div className="rounded-[20px] border border-[var(--error)]/20 bg-[var(--error-bg)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--error)]">
            {ui.secretaryResult.failureReasonHeading}
          </p>
          <p className="mt-1 text-sm text-foreground">{summary.failureReason}</p>
        </div>
      )}

      <div className="space-y-2 border-t border-[var(--border-subtle)] pt-5">
        <h3 className="text-sm font-medium tracking-wide text-accent">
          {ui.secretaryResult.nextRecommendHeading}
        </h3>
        <p className="text-base text-foreground">{summary.nextRecommend}</p>
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.secretaryResult.nextRecommendHint}
        </p>
        <Link
          href="/workspace"
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 text-sm font-medium text-foreground transition-colors hover:border-accent/40 focus-ring"
        >
          {ui.secretaryResult.newRequestAgain}
        </Link>
      </div>
    </section>
  );
}
