"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  LEARNING_ANALYSIS_PERIODS,
  fetchLatestLearningReport,
  runLearningAnalysisClient,
  type LearningAnalysisPeriod,
  type LearningInsightItem,
  type LearningReport,
} from "@/lib/learning-engine";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

function InsightList({
  title,
  items,
}: {
  title: string;
  items: LearningInsightItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-title text-foreground">{title}</h3>
      <ul className="space-y-3">
        {items.map((item, index) => (
          <li
            key={`${title}-${index}`}
            className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] p-4"
          >
            <p className="text-sm text-foreground">{item.text}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {ui.learningEngine.evidenceLabel}: {item.evidence}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LearningEngineSettings() {
  const [periodDays, setPeriodDays] = useState<LearningAnalysisPeriod>(30);
  const [report, setReport] = useState<LearningReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchLatestLearningReport(periodDays));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.learningEngine.loadError);
    } finally {
      setLoading(false);
    }
  }, [periodDays]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      setReport(await runLearningAnalysisClient(periodDays));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.learningEngine.analyzeError);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading && !report) {
    return <LoadingState message={ui.learningEngine.loading} />;
  }

  return (
    <div className="space-y-8">
      <Card padding="lg" className="border-[var(--border-subtle)]">
        <p className="text-sm text-[var(--text-secondary)]">
          {ui.learningEngine.philosophy}
        </p>
        <p className="mt-3 text-caption text-[var(--foreground-muted)]">
          {ui.learningEngine.pageSubtitle}
        </p>
      </Card>

      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm">
          <span className="text-[var(--text-secondary)]">
            {ui.learningEngine.periodLabel}
          </span>
          <select
            value={periodDays}
            onChange={(e) =>
              setPeriodDays(Number(e.target.value) as LearningAnalysisPeriod)
            }
            className="block rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
          >
            {LEARNING_ANALYSIS_PERIODS.map((days) => (
              <option key={days} value={days}>
                {ui.learningEngine.periodDays(days)}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="primary"
          onClick={() => void handleAnalyze()}
          isLoading={analyzing}
        >
          {analyzing ? ui.learningEngine.analyzing : ui.learningEngine.runAnalysis}
        </Button>
        <Link
          href="/settings/work-memory"
          className="text-sm text-accent hover:underline"
        >
          {ui.learningEngine.workMemoryLink}
        </Link>
      </div>

      {error && <ErrorState message={error} />}

      {report && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
            <span>{ui.learningEngine.summaryEvents(report.summary.eventCount)}</span>
            <span>{ui.learningEngine.summaryMemories(report.summary.memoryCount)}</span>
            <span>
              {ui.learningEngine.summaryCorrections(report.summary.correctionCount)}
            </span>
            {report.generatedAt && (
              <span>
                {ui.learningEngine.lastAnalyzed(
                  new Date(report.generatedAt).toLocaleDateString("ja-JP"),
                )}
              </span>
            )}
          </div>

          {!report.hasSufficientData ? (
            <Card padding="lg">
              <p className="text-sm font-medium text-foreground">
                {report.insufficientMessage ?? ui.learningEngine.insufficientData}
              </p>
              <p className="mt-2 text-caption text-[var(--foreground-muted)]">
                {ui.learningEngine.insufficientHint}
              </p>
            </Card>
          ) : (
            <div className="space-y-8">
              <InsightList
                title={ui.learningEngine.sectionImprovements}
                items={report.sections.improvements}
              />
              <InsightList
                title={ui.learningEngine.sectionMaintain}
                items={report.sections.maintain}
              />
              <InsightList
                title={ui.learningEngine.sectionRecommendations}
                items={report.sections.recommendations}
              />
              <InsightList
                title={ui.learningEngine.sectionFuture}
                items={report.sections.futureProposals}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
