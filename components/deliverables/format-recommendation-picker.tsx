"use client";

import type { DeliverableFormat } from "@/lib/deliverables/types";
import { DELIVERABLE_FORMAT_LABELS } from "@/lib/deliverables/types";
import type { OutputFormat } from "@/lib/documents/schema/enums";
import { Button } from "@/components/ui/button";

export type FormatRecommendation = {
  recommended: OutputFormat;
  alternatives: OutputFormat[];
  reason: string;
};

type FormatRecommendationPickerProps = {
  recommendation: FormatRecommendation | null;
  selectedFormats: DeliverableFormat[];
  onToggleFormat: (format: DeliverableFormat) => void;
  disabled?: boolean;
};

const PICKER_FORMATS: DeliverableFormat[] = ["docx", "pdf", "xlsx"];

function formatShortLabel(format: DeliverableFormat): string {
  if (format === "docx") return "Word";
  if (format === "xlsx") return "Excel";
  return DELIVERABLE_FORMAT_LABELS[format].split(" ")[0] ?? format;
}

export function FormatRecommendationPicker({
  recommendation,
  selectedFormats,
  onToggleFormat,
  disabled,
}: FormatRecommendationPickerProps) {
  return (
    <div className="space-y-3">
      {recommendation && (
        <p className="text-sm text-[var(--foreground-muted)]">
          <span className="font-medium text-foreground">おすすめ: </span>
          {formatShortLabel(recommendation.recommended)} — {recommendation.reason}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {PICKER_FORMATS.map((format) => {
          const selected = selectedFormats.includes(format);
          const isRecommended = recommendation?.recommended === format;
          return (
            <Button
              key={format}
              type="button"
              size="sm"
              variant={selected ? "primary" : "secondary"}
              disabled={disabled}
              onClick={() => onToggleFormat(format)}
            >
              {formatShortLabel(format)}
              {isRecommended ? " ★" : ""}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
