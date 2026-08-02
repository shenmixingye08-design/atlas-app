"use client";

import { useState, useTransition } from "react";

import type { PredictiveApplyPreview } from "@/lib/personal-memory/predict/types";
import {
  acceptPredictivePreviewClient,
  togglePredictiveMemoryClient,
} from "@/lib/personal-memory/client";
import { Button } from "@/components/ui/button";

export function PredictiveMemoryPreview({
  prediction: initial,
  onAccepted,
  className,
}: {
  prediction: PredictiveApplyPreview | null;
  onAccepted?: (prediction: PredictiveApplyPreview) => void;
  className?: string;
}) {
  const [prediction, setPrediction] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!prediction) return null;

  const hasConfirmOnly =
    prediction.autoApplyItems.length === 0 && prediction.items.length > 0;

  return (
    <section
      className={
        className ??
        "space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4"
      }
      aria-label="先回り適用プレビュー"
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {prediction.headline}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          {prediction.evidenceSummary}
        </p>
      </div>

      <ul className="space-y-2">
        {prediction.items.map((item) => {
          const key = item.memoryId ?? `${item.scope}-${item.summary}`;
          const low = item.requiresConfirm;
          return (
            <li key={key} className="space-y-1">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={item.enabled}
                  disabled={pending || !item.memoryId}
                  onChange={(e) => {
                    if (!item.memoryId) return;
                    startTransition(async () => {
                      try {
                        setPrediction(
                          await togglePredictiveMemoryClient({
                            predictionId: prediction.id,
                            memoryId: item.memoryId!,
                            enabled: e.target.checked,
                          }),
                        );
                        setError(null);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "切り替えに失敗しました",
                        );
                      }
                    });
                  }}
                />
                <span className="flex-1">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-[var(--text-secondary)]">
                    {" "}
                    — {item.summary}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                    Prediction {item.prediction.label}
                    {low ? " · 確認してください" : ""}
                  </span>
                  <span className="block text-[11px] text-[var(--text-secondary)]">
                    {item.explain}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] text-[var(--text-muted)]">推定一致率</p>
          <p className="text-xl font-semibold text-[var(--brand)]">
            {Math.round(prediction.estimatedMatchRate * 100)}%
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            全体 Prediction {prediction.overallPrediction.label}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              /* 編集 = stay on preview with toggles */
            }}
          >
            編集
          </Button>
          <Button
            size="sm"
            disabled={pending || (hasConfirmOnly && prediction.autoApplyItems.length === 0 && prediction.items.every((i) => !i.enabled))}
            onClick={() =>
              startTransition(async () => {
                try {
                  const next = await acceptPredictivePreviewClient({
                    predictionId: prediction.id,
                    enabledMemoryIds: prediction.items
                      .filter((i) => i.enabled && i.memoryId)
                      .map((i) => i.memoryId!),
                  });
                  setPrediction(next);
                  onAccepted?.(next);
                  setError(null);
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "確定に失敗しました",
                  );
                }
              })
            }
          >
            このまま作成
          </Button>
        </div>
      </div>

      {hasConfirmOnly ? (
        <p className="text-xs text-[var(--text-muted)]">
          Prediction が 60% 未満のため自動適用していません。必要な項目にチェックしてから作成してください。
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
