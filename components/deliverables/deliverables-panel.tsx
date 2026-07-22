"use client";

import type { Deliverable } from "@/lib/deliverables/types";
import { DELIVERABLE_FORMAT_LABELS } from "@/lib/deliverables/types";
import { TEMPLATE_LABELS } from "@/lib/documents/templates/registry";
import type { TemplateId } from "@/lib/documents/schema/enums";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import {
  FormatRecommendationPicker,
  type FormatRecommendation,
} from "./format-recommendation-picker";

type DeliverablesPanelProps = {
  deliverables: Deliverable[];
  isGenerating: boolean;
  error: string | null;
  matchedRule: string | null;
  documentModelId?: string | null;
  formatRecommendation?: FormatRecommendation | null;
  previewHtml?: string | null;
  onRerender?: (formats: ("docx" | "pdf" | "xlsx")[], templateId?: TemplateId) => void;
  isRerendering?: boolean;
};

export function DeliverablesPanel({
  deliverables,
  isGenerating,
  error,
  documentModelId,
  formatRecommendation,
  previewHtml,
  onRerender,
  isRerendering,
}: DeliverablesPanelProps) {
  if (!isGenerating && deliverables.length === 0 && !error && !previewHtml) {
    return null;
  }

  return (
    <section className="space-y-8 animate-fade-in" aria-labelledby="deliverables-heading">
      <h2 id="deliverables-heading" className="text-title text-foreground">
        {ui.work.deliverables}
      </h2>

      {isGenerating && (
        <p className="animate-soft-pulse text-body">{ui.work.preparingFiles}</p>
      )}

      {error && <ErrorState message={`${error} — ファイル形式を変更して再生成するか、しばらくしてからもう一度お試しください`} />}

      {formatRecommendation && onRerender && documentModelId && (
        <Card padding="md">
          <FormatRecommendationPicker
            recommendation={formatRecommendation}
            selectedFormats={deliverables.map((d) => d.format)}
            disabled={isRerendering || isGenerating}
            onToggleFormat={(format) => {
              if (format === "docx" || format === "pdf" || format === "xlsx") {
                onRerender([format]);
              }
            }}
          />
        </Card>
      )}

      {previewHtml && (
        <Card padding="md">
          <h3 className="text-overline mb-3">プレビュー</h3>
          <div
            className="prose prose-sm max-w-none text-foreground"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </Card>
      )}

      <div className="space-y-6">
        {deliverables.map((item) => (
          <Card key={item.id} padding="lg">
            <div className="rounded-[var(--radius-xl)] bg-[var(--background-subtle)] px-6 py-12 text-center">
              <p className="text-sm text-[var(--foreground-muted)]">
                {DELIVERABLE_FORMAT_LABELS[item.format]}
                {item.templateId
                  ? ` · ${TEMPLATE_LABELS[item.templateId as TemplateId] ?? item.templateId}`
                  : ""}
              </p>
              <p className="mt-2 text-base font-medium text-foreground truncate">
                {item.fileName}
              </p>
              {item.validationPassed === false && (
                <p className="mt-2 text-xs text-[var(--danger)]">検証に失敗しました</p>
              )}
              {(item.pageCount ?? item.sheetCount) != null && (
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  {item.pageCount != null ? `${item.pageCount} ページ` : null}
                  {item.sheetCount != null ? `${item.sheetCount} シート` : null}
                </p>
              )}
            </div>

            <a href={item.downloadUrl} download={item.fileName} className="mt-6 block">
              <Button variant="primary" size="lg" className="w-full">
                {ui.actions.download}
              </Button>
            </a>
          </Card>
        ))}
      </div>
    </section>
  );
}
