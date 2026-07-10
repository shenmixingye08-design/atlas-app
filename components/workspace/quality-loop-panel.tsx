"use client";

import type { QualityLoopResult } from "@/lib/orchestration/types";
import { ui } from "@/lib/i18n";

import { StageCard } from "./stage-card";

type QualityLoopPanelProps = {
  qualityLoop: QualityLoopResult;
};

const CRITERIA_LABELS: Record<string, string> = {
  accuracy: "正確性",
  completeness: "完全性",
  logic: "論理",
  readability: "可読性",
  professionalism: "プロフェッショナル性",
  visualStructure: "視覚構造",
};

export function QualityLoopPanel({ qualityLoop }: QualityLoopPanelProps) {
  const latestReview = qualityLoop.reviews[qualityLoop.reviews.length - 1];

  return (
    <>
      <section className="space-y-4 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-overline">{ui.workflow.qa}</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-[var(--status-neutral-bg)] px-2.5 py-1 text-[var(--foreground-muted)]">
              スコア: {qualityLoop.currentScore ?? "—"}/100
            </span>
            <span className="rounded-full bg-[var(--status-neutral-bg)] px-2.5 py-1 text-[var(--foreground-muted)]">
              リビジョン: {qualityLoop.revisionCount}
            </span>
            {qualityLoop.passed ? (
              <span className="rounded-full bg-[var(--status-success-bg)] px-2.5 py-1 text-[var(--status-success)]">
                QA合格
              </span>
            ) : (
              <span className="rounded-full bg-[var(--status-warning-bg)] px-2.5 py-1 text-[var(--status-warning)]">
                QA要改善
              </span>
            )}
          </div>
        </div>

        {qualityLoop.reviews.map((review) => (
          <div key={review.attempt} className="space-y-3">
            <StageCard
              label={`${ui.workflow.qa} #${review.attempt}`}
              subtitle={
                review.revisionNumber === 0
                  ? "初回評価"
                  : `リビジョン ${review.revisionNumber} 後`
              }
              status={
                review.qaStatus === "completed"
                  ? review.passed
                    ? "completed"
                    : "error"
                  : "error"
              }
              output={review.qa?.result.outputText ?? review.feedback}
              durationMs={review.qa?.durationMs}
              errorMessage={review.qaError}
            />
            {review.qaStatus === "completed" && (
              <div className="atlas-surface-subtle p-4">
                <p className="text-overline">
                  評価内訳 — {review.score}/100
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {Object.entries(review.criteria).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-[var(--radius-md)] bg-white px-3 py-2 text-xs ring-1 ring-[var(--border)]"
                    >
                      <span className="text-[var(--foreground-muted)]">
                        {CRITERIA_LABELS[key] ?? key}
                      </span>
                      <span className="font-medium text-foreground">{value}</span>
                    </div>
                  ))}
                </div>
                {review.tasksRevised.length > 0 && (
                  <p className="mt-3 text-caption">
                    修正タスク: {review.tasksRevised.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      {qualityLoop.ceoApproval && (
        <section className="space-y-4 animate-fade-up">
          <h2 className="text-overline">{ui.workflow.ceo}</h2>
          <StageCard
            label={ui.workflowPhases.ceo}
            subtitle="最終成果物を承認"
            status={
              qualityLoop.ceoApproval.status === "completed"
                ? qualityLoop.ceoApproval.approved
                  ? "completed"
                  : "error"
                : "error"
            }
            output={qualityLoop.ceoApproval.ceo?.result.outputText ?? qualityLoop.ceoApproval.comments}
            durationMs={qualityLoop.ceoApproval.ceo?.durationMs}
            errorMessage={qualityLoop.ceoApproval.error}
          />
        </section>
      )}

      {latestReview?.feedback && (
        <div className="atlas-surface-subtle p-4 animate-fade-up">
          <p className="text-overline">QAレビューコメント（最新）</p>
          <pre className="mt-3 max-h-48 overflow-auto text-sm leading-relaxed whitespace-pre-wrap text-[var(--foreground-muted)]">
            {latestReview.feedback}
          </pre>
        </div>
      )}
    </>
  );
}
