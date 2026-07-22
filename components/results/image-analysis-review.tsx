"use client";

import { useState } from "react";

import type { ImageAnalysisResult } from "@/lib/image-analysis/types";
import { Button } from "@/components/ui/button";

type ImageAnalysisReviewProps = {
  analysis: ImageAnalysisResult;
  onApply: (next: ImageAnalysisResult) => void;
};

function asEditableJson(analysis: ImageAnalysisResult): string {
  return JSON.stringify(analysis, null, 2);
}

/**
 * Lightweight review editor for structured image analysis.
 * Low-confidence / mismatch cases surface here before the user treats results as final.
 */
export function ImageAnalysisReview({
  analysis,
  onApply,
}: ImageAnalysisReviewProps) {
  const [draft, setDraft] = useState(() => asEditableJson(analysis));
  const [error, setError] = useState<string | null>(null);

  if (!analysis.requiresReview && analysis.warnings.length === 0) {
    return null;
  }

  return (
    <section className="mt-6 space-y-3 rounded-[var(--radius-xl)] border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/5 p-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--status-warning)]">
          要確認 — 解析結果の確認・修正
        </h3>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
          判読不能・金額不一致などの項目があります。必要なら修正してから Excel / CSV を再生成してください。
        </p>
      </div>

      {analysis.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--foreground-muted)]">
          {analysis.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={12}
        className="min-h-44 w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
        aria-label="画像解析JSONの編集"
      />

      {error && (
        <p className="text-sm text-[var(--status-danger)]">{error}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          onClick={() => {
            try {
              const parsed = JSON.parse(draft) as ImageAnalysisResult;
              if (!parsed.documentType || !parsed.title) {
                setError("documentType と title は必須です。");
                return;
              }
              setError(null);
              onApply({
                ...parsed,
                requiresReview: false,
                warnings: parsed.warnings ?? [],
              });
            } catch {
              setError("JSONの形式が正しくありません。");
            }
          }}
        >
          修正を反映して再生成
        </Button>
      </div>
    </section>
  );
}
