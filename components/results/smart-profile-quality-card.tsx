"use client";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";
import type { QualityImprovement } from "@/lib/smart-profile-suggestion";

type SmartProfileQualityCardProps = {
  quality: QualityImprovement;
  onOpen?: () => void;
};

export function SmartProfileQualityCard({
  quality,
  onOpen,
}: SmartProfileQualityCardProps) {
  if (quality.points.length === 0) return null;

  return (
    <Card
      padding="lg"
      variant={onOpen ? "interactive" : "default"}
      className="shadow-[var(--shadow-soft)]"
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
    >
      <p className="text-xs font-semibold tracking-wide text-accent">
        {ui.smartProfileSuggestion.qualityHeading}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
        {ui.smartProfileSuggestion.starsLabel(quality.stars)}
      </p>
      <p className="mt-1 text-sm text-[var(--foreground-muted)]">
        {ui.smartProfileSuggestion.qualityHint}
      </p>
      <ul className="mt-3 space-y-1.5">
        {quality.points.map((point) => (
          <li
            key={point}
            className="text-sm leading-relaxed text-[var(--foreground-muted)]"
          >
            ・{point}
          </li>
        ))}
      </ul>
    </Card>
  );
}
