"use client";

import type {
  ResearchCategory,
  ResearchStageResult,
} from "@/lib/orchestration/types";
import { ui } from "@/lib/i18n";

import { StageCard } from "./stage-card";

type ResearchPanelProps = {
  research: ResearchStageResult;
};

const CATEGORY_LABELS: Record<ResearchCategory, string> = {
  web_research: "Web調査",
  market_research: "市場調査",
  competitor_research: "競合調査",
  technical_documentation: "技術ドキュメント",
  statistics: "統計・データ",
  legal_references: "法務・規制",
};

export function ResearchPanel({ research }: ResearchPanelProps) {
  const assessmentOutput =
    research.assessmentPhase?.result.outputText ??
    research.assessment.rationale;

  return (
    <section className="space-y-4 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-overline">{ui.workflow.research}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {research.assessment.required ? (
            <span className="rounded-full bg-[var(--status-info-bg)] px-2.5 py-1 text-accent">
              調査実施
            </span>
          ) : (
            <span className="rounded-full bg-[var(--status-neutral-bg)] px-2.5 py-1 text-[var(--foreground-muted)]">
              調査不要
            </span>
          )}
          {research.report && (
            <span className="rounded-full bg-[var(--status-neutral-bg)] px-2.5 py-1 text-[var(--foreground-muted)]">
              信頼度: {research.report.confidenceScore}/100
            </span>
          )}
        </div>
      </div>

      <StageCard
        label={ui.workflow.research}
        subtitle="外部調査の要否を分析"
        status={
          research.assessmentStatus === "completed"
            ? "completed"
            : "error"
        }
        output={assessmentOutput}
        durationMs={research.assessmentPhase?.durationMs}
        errorMessage={research.assessmentError}
      />

      {research.assessment.categories.length > 0 && (
        <div className="atlas-surface-subtle p-4">
          <p className="text-overline">調査カテゴリ</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {research.assessment.categories.map((category) => (
              <span
                key={category}
                className="rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-xs text-accent"
              >
                {CATEGORY_LABELS[category] ?? category}
              </span>
            ))}
          </div>
          <p className="mt-3 text-caption">{research.assessment.rationale}</p>
        </div>
      )}

      {research.reportStatus === "skipped" && !research.assessment.required && (
        <div className="atlas-surface-subtle p-4 text-sm text-[var(--foreground-muted)]">
          外部調査は不要と判断され、企画へ直接進みました。
        </div>
      )}

      {research.reportStatus === "failed" && (
        <StageCard
          label={ui.workflow.research}
          subtitle="調査レポート生成"
          status="error"
          errorMessage={
            research.reportError ?? "調査レポートの生成に失敗しました"
          }
        />
      )}

      {research.report && research.reportStatus === "completed" && (
        <>
          <StageCard
            label={ui.workflow.research}
            subtitle="構造化調査レポート"
            status="completed"
            output={research.report.fullText}
            durationMs={research.reportPhase?.durationMs}
          />

          <div className="atlas-surface-subtle p-4 space-y-4">
            {research.report.executiveSummary && (
              <div>
                <p className="text-overline">概要</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {research.report.executiveSummary}
                </p>
              </div>
            )}

            {research.report.keyFindings.length > 0 && (
              <div>
                <p className="text-overline">主な発見</p>
                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  {research.report.keyFindings.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-accent">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {research.report.sources.length > 0 && (
              <div>
                <p className="text-overline">参照元</p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--foreground-muted)]">
                  {research.report.sources.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
