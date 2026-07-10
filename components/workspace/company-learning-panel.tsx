"use client";

import { useMemo } from "react";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { generateCompanyLearning } from "@/lib/learning";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

import { CompanyLearningSection } from "./company-learning-section";

type CompanyLearningPanelProps = {
  result: OrchestrationResult;
};

export function CompanyLearningPanel({ result }: CompanyLearningPanelProps) {
  const learning = useMemo(() => generateCompanyLearning(result), [result]);

  if (!learning) {
    return null;
  }

  return (
    <section className="space-y-4 animate-comm-in" aria-labelledby="company-learning-heading">
      <h2 id="company-learning-heading" className="text-title text-foreground">
        {ui.learning.sectionTitle}
      </h2>
      <Card padding="lg">
        <CompanyLearningSection learning={learning} />
      </Card>
    </section>
  );
}
