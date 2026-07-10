"use client";

import type { CompanyLearning, LearningConfidence } from "@/lib/learning";
import { ui } from "@/lib/i18n";

type CompanyLearningSectionProps = {
  learning: CompanyLearning;
};

const CONFIDENCE_LABELS: Record<LearningConfidence, string> = {
  high: ui.learning.confidenceHigh,
  medium: ui.learning.confidenceMedium,
  low: ui.learning.confidenceLow,
};

export function CompanyLearningSection({ learning }: CompanyLearningSectionProps) {
  return (
    <div className="space-y-8 border-t border-[var(--border)] pt-8 animate-fade-in">
      <div>
        <h3 className="text-title text-foreground">{ui.learning.sectionTitle}</h3>
        <p className="mt-1 text-caption">{ui.learning.savedNote}</p>
      </div>

      {learning.records.map((record) => (
        <div key={record.id} className="space-y-6">
          <div>
            <p className="text-overline">{ui.learning.workedLabel}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              {record.workedWell}
            </p>
          </div>

          {record.didNotWorkWell && (
            <div>
              <p className="text-overline">{ui.learning.notWorkedLabel}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                {record.didNotWorkWell}
              </p>
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-overline">{ui.learning.recommendationLabel}</p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {record.recommendation}
              </p>
            </div>
            <div>
              <p className="text-overline">{ui.learning.confidenceLabel}</p>
              <p className="mt-2 text-sm text-foreground">
                {CONFIDENCE_LABELS[record.confidence]}
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-overline">{ui.learning.departmentLabel}</p>
              <p className="mt-2 text-sm text-foreground">{record.department}</p>
            </div>
            <div>
              <p className="text-overline">{ui.learning.workflowLabel}</p>
              <p className="mt-2 text-sm text-foreground">{record.workflow}</p>
            </div>
            <div>
              <p className="text-overline">{ui.learning.topicLabel}</p>
              <p className="mt-2 text-sm text-foreground">{record.topic}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
