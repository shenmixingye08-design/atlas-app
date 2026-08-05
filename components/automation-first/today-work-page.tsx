"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/automation-first/empty-state";
import { ErrorState } from "@/components/automation-first/error-state";
import { KpiCard } from "@/components/automation-first/kpi-card";
import { PageHeader } from "@/components/automation-first/page-header";
import { RunningStepsPanel } from "@/components/automation-first/running-steps";
import { Timeline } from "@/components/automation-first/timeline";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import {
  buildRunningJobsFromRuns,
  mapOpsTodayWorkToTimeline,
} from "@/lib/automation-first/home-data";
import {
  buildTodayJobsFromAutomations,
  formatTodayDateLabel,
  jobsToTimelineItems,
} from "@/lib/automation-first/home-model";
import {
  fetchAutomationOperationsSummary,
  fetchAutomationRunsAll,
} from "@/lib/automation-platform/client";
import type { AutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import type { AutomationRun } from "@/lib/automation-platform/types";
import { fetchAutomations } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations } from "@/lib/compatibility";
import { LoadingState } from "@/components/ui/loading-state";
import { useFeatureAvailability } from "@/lib/feature-flags";

export function TodayWorkPage({
  initialAutomations,
}: {
  /** When provided (DEV preview), skip network fetch. */
  initialAutomations?: Automation[];
} = {}) {
  const { flags, loading: flagsLoading } = useFeatureAvailability();
  const opsEnabled =
    !flagsLoading &&
    (flags.automation_v2_enabled === true ||
      flags.automation_operations_enabled === true ||
      flags.automation_dashboard_v2_enabled === true);

  const [automations, setAutomations] = useState<Automation[] | null>(
    initialAutomations ? normalizeAutomations(initialAutomations) : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [opsSummary, setOpsSummary] = useState<AutomationOperationsSummary | null>(
    null,
  );
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [opsError, setOpsError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (initialAutomations) {
      setAutomations(normalizeAutomations(initialAutomations));
      setError(null);
      return;
    }
    setError(null);
    void fetchAutomations()
      .then((items) => setAutomations(normalizeAutomations(items)))
      .catch((err: Error) => {
        setError(err.message || "読み込めませんでした");
        setAutomations([]);
      });
  }, [initialAutomations]);

  useEffect(() => {
    if (initialAutomations) return;
    let cancelled = false;
    void fetchAutomations()
      .then((items) => {
        if (cancelled) return;
        setAutomations(normalizeAutomations(items));
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || "読み込めませんでした");
        setAutomations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [initialAutomations]);

  useEffect(() => {
    if (!opsEnabled || initialAutomations) return;
    let cancelled = false;
    void Promise.all([
      fetchAutomationOperationsSummary(),
      fetchAutomationRunsAll({ sort: "newest" }).catch(() => [] as AutomationRun[]),
    ])
      .then(([summary, nextRuns]) => {
        if (cancelled) return;
        setOpsSummary(summary);
        setRuns(nextRuns);
        setOpsError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setOpsError(err.message || "運用データの取得に失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, [opsEnabled, initialAutomations]);

  const jobs = useMemo(
    () => (automations ? buildTodayJobsFromAutomations(automations) : []),
    [automations],
  );
  const timeline = useMemo(() => {
    if (opsSummary) {
      return mapOpsTodayWorkToTimeline(opsSummary.todayWork, runs);
    }
    return jobsToTimelineItems(jobs);
  }, [opsSummary, runs, jobs]);
  const runningJobs = useMemo(() => buildRunningJobsFromRuns(runs), [runs]);

  useEffect(() => {
    if (automations) {
      trackAutomationFirstEvent("home_viewed", {
        source: "today_page",
        count: timeline.length,
      });
    }
  }, [automations, timeline.length]);

  if ((automations === null && !error) || flagsLoading) {
    return <LoadingState message="今日の仕事を準備しています…" />;
  }

  if (error) {
    return (
      <ErrorState
        description={error}
        onRetry={() => {
          trackAutomationFirstEvent("error_recovery_started", {
            source: "today_page",
          });
          setAutomations(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        eyebrow={formatTodayDateLabel()}
        title="今日の仕事"
        description="時系列で予定・実行中・確認待ち・完了を確認できます。"
      />

      {opsError ? (
        <ErrorState
          description={`運用データの取得に失敗しました: ${opsError}`}
        />
      ) : null}

      {timeline.length === 0 ? (
        <EmptyState
          title="今日の予定はまだありません"
          description="最初の自動化を作成すると、MINERVOTが自動で仕事を実行し、ここに今日の流れが表示されます。"
          primaryHref="/automations/new"
          primaryLabel="最初の自動化を作る"
          secondaryHref="/workspace"
          secondaryLabel="一度だけお願いする"
          onPrimaryClick={() =>
            trackAutomationFirstEvent("empty_state_cta_clicked", {
              source: "today_empty",
            })
          }
        />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:gap-8">
          <div className="space-y-6">
            <Timeline
              items={timeline}
              onItemOpen={(id) =>
                trackAutomationFirstEvent("run_detail_opened", {
                  id,
                  source: "today_timeline",
                })
              }
            />
            <RunningStepsPanel
              jobs={runningJobs}
              onOpen={(id) =>
                trackAutomationFirstEvent("run_detail_opened", {
                  id,
                  source: "today_running",
                })
              }
            />
          </div>
          <aside className="mt-6 space-y-4 lg:mt-0">
            <div className="af-card space-y-4 p-4">
              <h2 className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]">
                今日の状況
              </h2>
              {opsSummary ? (
                <div className="grid grid-cols-2 gap-4">
                  <KpiCard
                    label="実行中"
                    description="いま進んでいる仕事"
                    value={opsSummary.counts.running}
                    emptyHint="実行中の仕事はありません"
                  />
                  <KpiCard
                    label="確認待ち"
                    description="承認や確認が必要"
                    value={opsSummary.counts.awaitingApproval}
                    emphasize={opsSummary.counts.awaitingApproval > 0}
                    emptyHint="確認待ちはありません"
                  />
                  <KpiCard
                    label="入力待ち"
                    description="追加情報が必要"
                    value={opsSummary.counts.needsInput}
                    emptyHint="入力待ちはありません"
                  />
                  <KpiCard
                    label="本日失敗"
                    description="修復が必要な仕事"
                    value={opsSummary.counts.failedToday}
                    emphasize={opsSummary.counts.failedToday > 0}
                    emptyHint="本日の失敗はありません"
                  />
                </div>
              ) : (
                <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">
                  確認待ちは詳細から承認できます。失敗した仕事は実行詳細から修復できます。
                </p>
              )}
              <Link
                href="/automations"
                className="inline-flex min-h-[var(--touch-target)] items-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
              >
                自動化一覧へ
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
