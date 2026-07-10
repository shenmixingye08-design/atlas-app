"use client";

import { useMemo } from "react";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { findEmployeeById } from "@/lib/employees/registry";
import { generateCompanyLearning } from "@/lib/learning";
import { generateGrowthReview } from "@/lib/growth";
import { formatRankMarker, generatePrReview } from "@/lib/pr";
import type { PrPriority } from "@/lib/pr";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

import { GrowthReviewSection } from "./growth-review-section";
import { CompanyLearningSection } from "./company-learning-section";

type PrReviewPanelProps = {
  result: OrchestrationResult;
  showGrowthReview?: boolean;
  showCompanyLearning?: boolean;
};

const PRIORITY_LABELS: Record<PrPriority, string> = {
  high: ui.pr.priorityHigh,
  medium: ui.pr.priorityMedium,
  low: ui.pr.priorityLow,
};

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {items.map((item) => (
        <li
          key={item}
          className="text-sm text-[var(--foreground-muted)] before:mr-2 before:content-['・']"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function PrReviewPanel({
  result,
  showGrowthReview = true,
  showCompanyLearning = true,
}: PrReviewPanelProps) {
  const review = useMemo(() => generatePrReview(result), [result]);
  const growthReview = useMemo(
    () => (review ? generateGrowthReview(review, result) : null),
    [review, result],
  );
  const companyLearning = useMemo(
    () => generateCompanyLearning(result),
    [result],
  );

  if (!review) {
    return null;
  }

  const prLead = findEmployeeById("marketing-director");
  const recommended = review.channels.filter((c) => c.recommended);
  const strategy = review.strategy;

  return (
    <section
      className="space-y-4 animate-comm-in"
      aria-labelledby="pr-review-heading"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--background-subtle)] text-lg"
          aria-hidden="true"
        >
          {prLead?.avatar ?? "📣"}
        </span>
        <div>
          <h2 id="pr-review-heading" className="text-title text-foreground">
            {ui.pr.sectionTitle}
          </h2>
          <p className="text-caption">
            {prLead?.name ?? ui.pr.sectionTitle} · {ui.pr.planningOnly}
          </p>
        </div>
      </div>

      <Card padding="lg">
        <div className="space-y-8">
          <div>
            <p className="text-overline">{ui.pr.shareDecision}</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {review.shouldShare ? ui.pr.shouldShareYes : ui.pr.shouldShareNo}
            </p>
          </div>

          {review.shouldShare && (
            <>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-overline">{ui.pr.summaryLabel}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {review.summary}
                  </p>
                </div>
                <div>
                  <p className="text-overline">{ui.pr.headlineLabel}</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {review.headline}
                  </p>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-overline">{ui.pr.audienceLabel}</p>
                  <p className="mt-2 text-sm text-foreground">
                    {review.targetAudience}
                  </p>
                </div>
                <div>
                  <p className="text-overline">{ui.pr.reasonLabel}</p>
                  <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                    {review.reason}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-overline">{ui.pr.priorityLabel}</p>
                <p className="mt-2 text-sm text-foreground">
                  {PRIORITY_LABELS[review.priority]}
                </p>
              </div>

              <div>
                <p className="text-overline">{ui.pr.channelsLabel}</p>
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  {review.channels.map((channel) => (
                    <li
                      key={channel.id}
                      className={`text-sm ${
                        channel.recommended
                          ? "font-medium text-foreground"
                          : "text-[var(--foreground-subtle)]"
                      }`}
                    >
                      {channel.recommended ? "✓ " : "　"}
                      {channel.label}
                    </li>
                  ))}
                </ul>
                {recommended.length > 0 && (
                  <p className="mt-3 text-caption">
                    {ui.pr.recommendedCount(recommended.length)}
                  </p>
                )}
              </div>

              {strategy && (
                <div className="space-y-8 border-t border-[var(--border)] pt-8 animate-fade-in">
                  <h3 className="text-title text-foreground">
                    {ui.pr.strategyTitle}
                  </h3>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <p className="text-overline">{ui.pr.strategyWhyLabel}</p>
                      <BulletList items={strategy.whyReasons} />
                    </div>
                    <div>
                      <p className="text-overline">
                        {ui.pr.strategyAudienceLabel}
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {strategy.audiences.join(" · ")}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <p className="text-overline">
                        {ui.pr.strategyTimingLabel}
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {strategy.timing}
                      </p>
                    </div>
                    <div>
                      <p className="text-overline">
                        {ui.pr.strategyCampaignLabel}
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        「{strategy.campaignTitle}」
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-overline">
                      {ui.pr.strategyChannelsLabel}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {strategy.channelPriority.map((channel) => (
                        <li
                          key={channel.id}
                          className="text-sm text-foreground"
                        >
                          <span className="font-medium">
                            {formatRankMarker(channel.rank)} {channel.label}
                          </span>
                          <span className="text-[var(--foreground-muted)]">
                            {" "}
                            — {channel.rationale}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-caption text-[var(--foreground-muted)]">
                      {strategy.channelPrioritySummary}
                    </p>
                  </div>

                  <div>
                    <p className="text-overline">
                      {ui.pr.strategyEffectsLabel}
                    </p>
                    <BulletList items={strategy.expectedEffects} />
                  </div>
                </div>
              )}

              {showGrowthReview && growthReview && (
                <GrowthReviewSection review={growthReview} />
              )}
            </>
          )}

          {showCompanyLearning && companyLearning && (
            <CompanyLearningSection learning={companyLearning} />
          )}
        </div>
      </Card>
    </section>
  );
}
