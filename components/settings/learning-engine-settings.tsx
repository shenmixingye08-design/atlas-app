"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { fetchAutomations } from "@/lib/automations/client";
import {
  fetchLatestLearningReport,
  runLearningAnalysisClient,
  type LearningReport,
} from "@/lib/learning-engine";
import {
  ANALYSIS_DISPLAY_PERIODS,
  IMPROVEMENT_EFFECT_LABELS,
  buildAdviceCards,
  buildAnalysisStats,
  buildRecommendationBuckets,
  formatAvgDuration,
  type AnalysisDisplayPeriod,
  type AdviceCardModel,
} from "@/lib/learning-engine/display";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

function AdviceCard({ card }: { card: AdviceCardModel }) {
  return (
    <li>
      <Card
        padding="lg"
        className="flex h-full flex-col border border-[var(--border-subtle)] bg-[var(--card)] animate-fade-up"
      >
        <p className="text-base font-medium leading-relaxed text-foreground">
          {card.text}
        </p>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {ui.learningEngine.evidenceLabel}: {card.evidence}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {card.effects.map((effect) => (
            <span
              key={effect}
              className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
            >
              {IMPROVEMENT_EFFECT_LABELS[effect]}
            </span>
          ))}
          <span className="rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-[11px] font-medium text-accent">
            {ui.learningEngine.effectDetailComingSoon}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={card.action.href}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-accent px-5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] focus-ring"
          >
            {card.action.label}
          </Link>
          <span className="text-xs text-[var(--text-muted)]">
            {ui.learningEngine.confidenceShort}:{" "}
            {Math.round(card.confidence * 100)}%
          </span>
        </div>
      </Card>
    </li>
  );
}

export function LearningEngineSettings() {
  const [displayPeriod, setDisplayPeriod] =
    useState<AnalysisDisplayPeriod>("30");
  const [report, setReport] = useState<LearningReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [automationEnabled, setAutomationEnabled] = useState<number | null>(
    null,
  );
  const [automationTotal, setAutomationTotal] = useState<number | null>(null);

  const periodConfig = ANALYSIS_DISPLAY_PERIODS.find(
    (item) => item.id === displayPeriod,
  );
  const apiPeriod = periodConfig?.apiPeriodDays ?? null;
  const periodSupported = apiPeriod != null;

  const reload = useCallback(async () => {
    if (!apiPeriod) {
      setReport(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setReport(await fetchLatestLearningReport(apiPeriod));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.learningEngine.loadError);
    } finally {
      setLoading(false);
    }
  }, [apiPeriod]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void fetchAutomations()
      .then((items) => {
        setAutomationTotal(items.length);
        setAutomationEnabled(items.filter((item) => item.enabled).length);
      })
      .catch(() => {
        setAutomationTotal(null);
        setAutomationEnabled(null);
      });
  }, []);

  const handleAnalyze = async () => {
    if (!apiPeriod) return;
    setAnalyzing(true);
    setError(null);
    try {
      setReport(await runLearningAnalysisClient(apiPeriod));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.learningEngine.analyzeError,
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const adviceCards = useMemo(
    () => (report?.hasSufficientData ? buildAdviceCards(report) : []),
    [report],
  );

  const recommendationBuckets = useMemo(
    () => (report?.hasSufficientData ? buildRecommendationBuckets(report) : []),
    [report],
  );

  const stats = useMemo(
    () =>
      buildAnalysisStats({
        report: report?.hasSufficientData ? report : report,
        automationEnabledCount: automationEnabled,
        automationTotalCount: automationTotal,
      }),
    [report, automationEnabled, automationTotal],
  );

  const avgDurationLabel = formatAvgDuration(
    report?.summary.avgDurationMs ?? null,
  );

  if (loading && periodSupported && !report) {
    return <LoadingState message={ui.learningEngine.loading} />;
  }

  return (
    <div className="space-y-10 sm:space-y-12">
      <header className="space-y-3">
        <p className="text-caption text-accent">{ui.brand}</p>
        <h1 className="text-display text-foreground">
          {ui.learningEngine.pageTitle}
        </h1>
        <p className="text-body max-w-2xl text-[var(--text-secondary)]">
          {ui.learningEngine.pageSubtitle}
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label={ui.learningEngine.periodLabel}
          >
            {ANALYSIS_DISPLAY_PERIODS.map((period) => (
              <button
                key={period.id}
                type="button"
                role="tab"
                aria-selected={displayPeriod === period.id}
                onClick={() => setDisplayPeriod(period.id)}
                className={cn(
                  "min-h-[44px] rounded-full px-4 py-2 text-sm font-medium transition-colors focus-ring",
                  displayPeriod === period.id
                    ? "bg-accent text-white"
                    : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-foreground",
                )}
              >
                {period.label}
                {period.apiPeriodDays == null ? (
                  <span className="ml-1 text-[10px] opacity-80">
                    ({ui.learningEngine.comingSoon})
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {periodSupported && (
            <Button
              variant="primary"
              className="min-h-[44px]"
              onClick={() => void handleAnalyze()}
              isLoading={analyzing}
            >
              {analyzing
                ? ui.learningEngine.analyzing
                : ui.learningEngine.runAnalysis}
            </Button>
          )}
        </div>

        {!periodSupported && (
          <Card
            padding="lg"
            className="border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)]/40"
          >
            <p className="text-sm font-medium text-foreground">
              {ui.learningEngine.periodComingSoonTitle}
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {ui.learningEngine.periodComingSoonHint}
            </p>
          </Card>
        )}
      </section>

      {error && <ErrorState message={error} />}

      {periodSupported && (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              {ui.learningEngine.analysisTitle}
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card
                  key={stat.id}
                  padding="md"
                  className="border border-[var(--border-subtle)] bg-[var(--card)] text-center"
                >
                  <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
                  <p
                    className={cn(
                      "mt-2 text-xl font-semibold tracking-tight",
                      stat.supported
                        ? "text-foreground"
                        : "text-[var(--text-muted)]",
                    )}
                  >
                    {stat.value}
                  </p>
                </Card>
              ))}
            </div>
            {report && (
              <div className="flex flex-wrap gap-3 text-sm text-[var(--text-secondary)]">
                <span>
                  {ui.learningEngine.summaryEvents(report.summary.eventCount)}
                </span>
                <span>
                  {ui.learningEngine.summaryMemories(report.summary.memoryCount)}
                </span>
                <span>
                  {ui.learningEngine.summaryCorrections(
                    report.summary.correctionCount,
                  )}
                </span>
                {avgDurationLabel && (
                  <span>
                    {ui.learningEngine.avgDuration(avgDurationLabel)}
                  </span>
                )}
                {report.generatedAt && (
                  <span>
                    {ui.learningEngine.lastAnalyzed(
                      new Date(report.generatedAt).toLocaleDateString("ja-JP"),
                    )}
                  </span>
                )}
              </div>
            )}
          </section>

          {!report ? (
            <Card
              padding="lg"
              className="border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 text-center"
            >
              <p className="text-base font-medium text-foreground">
                {ui.learningEngine.noDataYet}
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {ui.learningEngine.emptyHint}
              </p>
              <div className="mt-6">
                <Button
                  variant="primary"
                  onClick={() => void handleAnalyze()}
                  isLoading={analyzing}
                >
                  {ui.learningEngine.runAnalysis}
                </Button>
              </div>
            </Card>
          ) : !report.hasSufficientData ? (
            <Card
              padding="lg"
              className="border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 text-center"
            >
              <p className="text-base font-medium text-foreground">
                {report.insufficientMessage ?? ui.learningEngine.noDataYet}
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {ui.learningEngine.emptyHint}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/workspace"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-accent px-5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] focus-ring"
                >
                  {ui.learningEngine.startWork}
                </Link>
                <Link
                  href="/settings/work-memory"
                  className="text-sm text-accent hover:underline"
                >
                  {ui.learningEngine.workMemoryLink}
                </Link>
              </div>
            </Card>
          ) : (
            <>
              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {ui.learningEngine.adviceTitle}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {ui.learningEngine.adviceHint}
                  </p>
                </div>
                {adviceCards.length === 0 ? (
                  <Card padding="lg" className="bg-[var(--surface-muted)]/40">
                    <p className="text-sm text-[var(--text-secondary)]">
                      {ui.learningEngine.noAdviceYet}
                    </p>
                  </Card>
                ) : (
                  <ul className="grid gap-4 lg:grid-cols-2">
                    {adviceCards.map((card) => (
                      <AdviceCard key={card.id} card={card} />
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">
                  {ui.learningEngine.recommendationsTitle}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {recommendationBuckets.map((bucket) => (
                    <Card
                      key={bucket.id}
                      padding="lg"
                      className="border border-[var(--border-subtle)] bg-[var(--card)]"
                    >
                      <h3 className="text-sm font-semibold text-foreground">
                        {bucket.title}
                      </h3>
                      {bucket.items.length === 0 ? (
                        <p className="mt-3 text-sm text-[var(--text-muted)]">
                          {bucket.emptyHint}
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-3">
                          {bucket.items.map((item, index) => (
                            <li
                              key={`${bucket.id}-${index}`}
                              className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-3 text-sm text-[var(--text-secondary)]"
                            >
                              {item.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
