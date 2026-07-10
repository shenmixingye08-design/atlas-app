"use client";

import type { GrowthReview, ImpactLevel } from "@/lib/growth";
import { ui } from "@/lib/i18n";

type GrowthReviewSectionProps = {
  review: GrowthReview;
};

const LEVEL_LABELS: Record<ImpactLevel, string> = {
  high: ui.growth.levelHigh,
  medium: ui.growth.levelMedium,
  low: ui.growth.levelLow,
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

function ImpactRow({ label, level }: { label: string; level: ImpactLevel }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-[var(--foreground-muted)]">{label}</span>
      <span className="font-medium text-foreground">{LEVEL_LABELS[level]}</span>
    </div>
  );
}

export function GrowthReviewSection({ review }: GrowthReviewSectionProps) {
  const { impacts } = review;

  return (
    <div className="space-y-8 border-t border-[var(--border)] pt-8 animate-fade-in">
      <h3 className="text-title text-foreground">{ui.growth.sectionTitle}</h3>

      <div>
        <p className="text-overline">{ui.growth.summaryLabel}</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          {review.summary}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-overline">{ui.growth.assessmentLabel}</p>
          <ImpactRow label={ui.growth.reachLabel} level={impacts.reach} />
          <ImpactRow
            label={ui.growth.engagementLabel}
            level={impacts.engagement}
          />
          <ImpactRow label={ui.growth.seoLabel} level={impacts.seoValue} />
          <ImpactRow
            label={ui.growth.acquisitionLabel}
            level={impacts.userAcquisition}
          />
          <ImpactRow
            label={ui.growth.brandLabel}
            level={impacts.brandAwareness}
          />
          <ImpactRow
            label={ui.growth.confidenceLabel}
            level={impacts.confidence}
          />
        </div>

        <div>
          <p className="text-overline">{ui.growth.expectedEffectsLabel}</p>
          <ul className="mt-3 space-y-2">
            {review.channelEffects.map((effect) => (
              <li key={effect.id} className="text-sm text-foreground">
                <span className="font-medium">{LEVEL_LABELS[effect.level]}</span>
                <span className="text-[var(--foreground-muted)]">
                  {" "}
                  — {effect.metric}
                  {effect.label ? `（${effect.label}）` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-overline">{ui.growth.strengthsLabel}</p>
          <BulletList items={review.strengths} />
        </div>
        <div>
          <p className="text-overline">{ui.growth.weaknessesLabel}</p>
          <BulletList items={review.weaknesses} />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-overline">{ui.growth.improvementsLabel}</p>
          <BulletList items={review.improvements} />
        </div>
        <div>
          <p className="text-overline">{ui.growth.nextTestsLabel}</p>
          <BulletList items={review.nextTests} />
        </div>
      </div>

      <div>
        <p className="text-overline">{ui.growth.recommendationLabel}</p>
        <p className="mt-2 text-sm text-foreground">{review.recommendation}</p>
      </div>
    </div>
  );
}
