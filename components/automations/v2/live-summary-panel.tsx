"use client";

import { useEffect, useState } from "react";

import {
  buildHumanSummary,
  describeExecutionPolicy,
  describeSchedule,
  describeSteps,
} from "@/lib/automation-platform/wizard/schedule-copy";
import type { AutomationWizardDraft } from "@/lib/automation-platform/wizard/types";
import type { PredictiveApplyPreview } from "@/lib/personal-memory/predict/types";
import { LiveIntegrationsPreflightBanner } from "@/components/automations/v2/live-integrations-preflight-banner";

type LiveSummaryPanelProps = {
  draft: AutomationWizardDraft;
  validationMessages: string[];
};

/**
 * Right-pane (desktop) / expandable (mobile) live summary.
 * Prediction uses personal-memory predict API when memory is on — no LLM.
 */
export function LiveSummaryPanel({
  draft,
  validationMessages,
}: LiveSummaryPanelProps) {
  const memoryOn = draft.memoryEnabled;
  const [prediction, setPrediction] = useState<PredictiveApplyPreview | null>(
    null,
  );
  const [fetchKey, setFetchKey] = useState(0);

  // Reset prediction when memory turns off without sync setState-in-effect.
  const effectivePrediction = memoryOn ? prediction : null;

  useEffect(() => {
    if (!memoryOn) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetch("/api/personal-memory/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "predict",
          workCategory: draft.name || draft.categoryIds[0] || "営業資料",
          notes: draft.freeformNotes || draft.naturalLanguageSeed,
          automationId: draft.createdAutomationId,
        }),
      })
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as { prediction?: PredictiveApplyPreview };
        })
        .then((payload) => {
          if (!cancelled) {
            setPrediction(payload?.prediction ?? null);
            setFetchKey((k) => k + 1);
          }
        })
        .catch(() => {
          if (!cancelled) setPrediction(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    memoryOn,
    draft.name,
    draft.categoryIds,
    draft.freeformNotes,
    draft.naturalLanguageSeed,
    draft.createdAutomationId,
  ]);

  const summary = buildHumanSummary(draft);

  return (
    <section
      className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      aria-label="依頼内容の要約"
      data-prediction-fetch={fetchKey}
    >
      <div>
        <p className="text-xs font-semibold tracking-wide text-[var(--brand)]">
          AI確認（リアルタイム）
        </p>
        <h2 className="mt-1 text-base font-semibold">この内容で進めます</h2>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
        {summary || "左側で仕事を選ぶと、ここに内容がまとまります。"}
      </p>

      <LiveIntegrationsPreflightBanner draft={draft} />

      <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
        <li>・タイミング: {describeSchedule(draft)}</li>
        <li>・成果物: {describeSteps(draft)}</li>
        <li>・確認: {describeExecutionPolicy(draft)}</li>
        <li>
          ・知らせ方:{" "}
          {[
            draft.notifyOnSuccess ? "完了" : null,
            draft.notifyOnFailure ? "失敗" : null,
            draft.executionMode === "review_before_run" ||
            draft.selectedApprovalStepIds.length > 0
              ? "承認必須"
              : null,
            !draft.notifyOnSuccess &&
            !draft.notifyOnFailure &&
            draft.notificationChannels.length === 0
              ? "通知なし"
              : null,
          ]
            .filter(Boolean)
            .join(" / ") || "履歴で確認"}
        </li>
        <li>
          ・覚え方:{" "}
          {draft.memoryEnabled
            ? "今回の設定を覚える / 既存の好みを使う"
            : "今回だけ"}
        </li>
      </ul>

      {memoryOn && effectivePrediction ? (
        <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-3">
          <p className="text-xs font-medium">適用予定の好み</p>
          <p className="mt-1 text-lg font-semibold text-[var(--brand)]">
            Prediction{" "}
            {Math.round(effectivePrediction.estimatedMatchRate * 100)}%
          </p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
            {effectivePrediction.autoApplyItems.slice(0, 6).map((item) => (
              <li key={`${item.memoryId}-${item.scope}`}>
                ✓ {item.title}
                <span className="text-[var(--text-muted)]">
                  {" "}
                  · {item.prediction.score}%
                </span>
              </li>
            ))}
            {effectivePrediction.autoApplyItems.length === 0 ? (
              <li>まだ確度の高い好みはありません（確認して進められます）</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {validationMessages.length > 0 ? (
        <div className="rounded-xl border border-[var(--error)]/25 bg-[var(--error-bg)] px-3 py-2 text-xs text-[var(--error)]">
          <p className="font-medium">まだ足りない／注意</p>
          <ul className="mt-1 list-disc pl-4">
            {validationMessages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          必須項目は揃っています。確認画面で任せられます。
        </p>
      )}
    </section>
  );
}
