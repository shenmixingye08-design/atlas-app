"use client";

import { useMemo } from "react";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { generateGrowthReview } from "@/lib/growth";
import { generatePrReview } from "@/lib/pr";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

import { GrowthReviewSection } from "./growth-review-section";

type GrowthReviewPanelProps = {
  result: OrchestrationResult;
};

export function GrowthReviewPanel({ result }: GrowthReviewPanelProps) {
  const prReview = useMemo(() => generatePrReview(result), [result]);
  const review = useMemo(
    () => (prReview ? generateGrowthReview(prReview, result) : null),
    [prReview, result],
  );

  if (!review) {
    return null;
  }

  return (
    <section className="space-y-4 animate-comm-in" aria-labelledby="growth-review-heading">
      <h2 id="growth-review-heading" className="text-title text-foreground">
        {ui.growth.sectionTitle}
      </h2>
      <Card padding="lg">
        <GrowthReviewSection review={review} />
      </Card>
    </section>
  );
}
