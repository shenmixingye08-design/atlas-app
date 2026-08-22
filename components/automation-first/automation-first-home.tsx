"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AttentionCard } from "@/components/automation-first/attention-card";
import { ErrorState } from "@/components/automation-first/error-state";
import { HomePrimaryActions } from "@/components/automation-first/home-primary-actions";
import { SectionHeader } from "@/components/automation-first/page-header";
import { RunningStepsPanel } from "@/components/automation-first/running-steps";
import { Timeline } from "@/components/automation-first/timeline";
import { IconClock } from "@/components/ui/icons";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import {
  buildRunningJobsFromRuns,
  buildWeeklyStatsFromRuns,
  formatNextRunDateTime,
  mapOpsAttentionToHomeItems,
  mapOpsTodayWorkToTimeline,
  type HomeTimelineRow,
  type HomeWeeklyStats,
} from "@/lib/automation-first/home-data";
import {
  applyOpsSummaryToHomeSummary,
  buildHomeAttentionItems,
  buildHomeSummary,
  buildTodayJobsFromAutomations,
  formatTodayDateLabel,
  greetingForHour,
  jobsToTimelineItems,
  type HomeAttentionItem,
  type HomeSummary,
} from "@/lib/automation-first/home-model";
import {
  fetchAutomationOperationsSummary,
  fetchAutomationRunsAll,
} from "@/lib/automation-platform/client";
import type { AutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import type { AutomationRun } from "@/lib/automation-platform/types";
import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import { useFeatureAvailability } from "@/lib/feature-flags";

export type AutomationFirstHomeProps = {
  automations: Automation[];
  projects: Project[];
};

function HomeSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy aria-label="読み込み中">
      <div className="h-8 w-48 rounded bg-[var(--surface-muted)]" />
      <div className="h-40 rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
    </div>
  );
}

function WeeklyStatsCard({ stats }: { stats: HomeWeeklyStats }) {
  return (
    <section
      aria-labelledby="af-week-heading"
      className="animate-card-enter rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5"
    >
      <h3
        id="af-week-heading"
        className="text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]"
      >
        今週の実績
      </h3>
      <dl className="mt-2.5 grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            完了した仕事
          </dt>
          <dd className="text-base font-semibold tabular-nums">
            {stats.completedJobs}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            成功率
          </dt>
          <dd className="text-base font-semibold tabular-nums">
            {stats.successRatePercent == null
              ? "—"
              : `${stats.successRatePercent}%`}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            完成したもの
          </dt>
          <dd className="text-base font-semibold tabular-nums">
            {stats.artifactCount}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            自動で進めた手順
          </dt>
          <dd className="text-base font-semibold tabular-nums">
            {stats.autoStepCount}
          </dd>
        </div>
        {stats.savedMinutes != null && stats.savedMinutes > 0 ? (
          <div>
            <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
              任せた時間
            </dt>
            <dd className="flex items-baseline gap-1 text-base font-semibold tabular-nums">
              <IconClock className="h-3.5 w-3.5 text-[var(--brand)]" />
              {stats.savedMinutes}
              <span className="text-[length:var(--text-caption)] font-medium text-[var(--text-muted)]">
                分
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function hasMeaningfulWeeklyStats(stats: HomeWeeklyStats): boolean {
  return (
    stats.completedJobs > 0 ||
    stats.artifactCount > 0 ||
    stats.autoStepCount > 0 ||
    (stats.successRatePercent != null && stats.completedJobs > 0) ||
    (stats.savedMinutes != null && stats.savedMinutes > 0)
  );
}

export function AutomationFirstHome({
  automations,
}: AutomationFirstHomeProps) {
  const { flags } = useFeatureAvailability();
  const opsEnabled =
    flags.automation_v2_enabled === true ||
    flags.automation_operations_enabled === true ||
    flags.automation_dashboard_v2_enabled === true;

  const now = useMemo(() => new Date(), []);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [opsSummary, setOpsSummary] = useState<AutomationOperationsSummary | null>(
    null,
  );
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [opsRequestId, setOpsRequestId] = useState(0);

  useEffect(() => {
    if (!opsEnabled) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setOpsLoading(true);
      setOpsError(null);
    });

    void Promise.all([
      fetchAutomationOperationsSummary(),
      fetchAutomationRunsAll({ sort: "newest" }),
    ])
      .then(([summary, nextRuns]) => {
        if (cancelled) return;
        setOpsSummary(summary);
        setRuns(nextRuns);
        setOpsError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOpsSummary(null);
        setOpsError(
          error instanceof Error
            ? error.message
            : "運用データの取得に失敗しました",
        );
      })
      .finally(() => {
        if (!cancelled) setOpsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [opsEnabled, opsRequestId]);

  const v1Jobs = useMemo(
    () => buildTodayJobsFromAutomations(automations, now),
    [automations, now],
  );
  const v1Attention = useMemo(
    () => buildHomeAttentionItems(automations),
    [automations],
  );

  const attention: HomeAttentionItem[] = useMemo(() => {
    if (opsSummary) {
      return mapOpsAttentionToHomeItems(opsSummary.attention);
    }
    const awaiting = v1Jobs
      .filter((job) => job.status === "awaiting_review")
      .map(
        (job): HomeAttentionItem => ({
          id: `await:${job.id}`,
          kind: "approval",
          title: job.title,
          description: "実行前の確認が必要です",
          href: job.href ?? "/automations",
          actionLabel: "確認する",
        }),
      );
    return [...awaiting, ...v1Attention];
  }, [opsSummary, v1Attention, v1Jobs]);

  const summary: HomeSummary = useMemo(() => {
    const base = buildHomeSummary(automations, v1Jobs, attention);
    if (!opsSummary) return base;
    const scheduledToday = opsSummary.todayWork.filter((item) =>
      /予定|scheduled/i.test(item.statusLabel),
    ).length;
    const partial = opsSummary.attention.filter(
      (item) => item.kind === "partially_succeeded",
    ).length;
    return applyOpsSummaryToHomeSummary(base, {
      counts: opsSummary.counts,
      attentionCount: attention.length,
      scheduledToday,
      partiallySucceeded: partial,
    });
  }, [automations, v1Jobs, attention, opsSummary]);

  const timeline: HomeTimelineRow[] = useMemo(() => {
    if (opsSummary) {
      return mapOpsTodayWorkToTimeline(opsSummary.todayWork, runs);
    }
    return jobsToTimelineItems(v1Jobs).map((item) => ({
      id: item.id,
      timeLabel: item.timeLabel,
      title: item.title,
      status: item.status,
      statusLabel: item.actionLabel,
      currentStep: null,
      nextAction: item.actionLabel,
      artifactLabel: null,
      href: item.href,
      tone: "muted" as const,
    }));
  }, [opsSummary, runs, v1Jobs]);

  const runningJobs = useMemo(() => buildRunningJobsFromRuns(runs), [runs]);
  const weeklyStats = useMemo(() => buildWeeklyStatsFromRuns(runs, now), [runs, now]);

  const recentCompleted = useMemo(() => {
    if (opsSummary?.recentArtifacts.length) {
      return opsSummary.recentArtifacts.slice(0, 5).map((artifact) => ({
        id: artifact.id,
        title: artifact.automationName,
        detail: artifact.label,
        href: artifact.href,
        meta: formatNextRunDateTime(artifact.createdAt),
      }));
    }
    return v1Jobs
      .filter((job) => job.status === "completed")
      .slice(0, 4)
      .map((job) => ({
        id: job.id,
        title: job.title,
        detail: job.scheduleLabel ?? "完了",
        href: job.href ?? "/history",
        meta: job.scheduledTime ?? "",
      }));
  }, [opsSummary, v1Jobs]);

  const nextRun = opsSummary?.nextRun ?? null;

  useEffect(() => {
    trackAutomationFirstEvent("home_viewed", {
      automations: automations.length,
      active: summary.activeAutomationCount,
      attention: summary.attentionCount,
      ops: Boolean(opsSummary),
    });
  }, [
    automations.length,
    summary.activeAutomationCount,
    summary.attentionCount,
    opsSummary,
  ]);

  const hasAutomations =
    automations.length > 0 || (opsSummary?.counts.activeAutomations ?? 0) > 0;
  const isReturningUser =
    hasAutomations ||
    attention.length > 0 ||
    timeline.length > 0 ||
    runningJobs.length > 0 ||
    recentCompleted.length > 0 ||
    Boolean(nextRun) ||
    summary.completedRuns > 0;
  const showDashboardSkeleton =
    automations.length > 0 &&
    opsEnabled &&
    opsLoading &&
    !opsSummary &&
    !opsError;

  const attentionSection =
    attention.length > 0 ? (
      <section aria-labelledby="af-attention-heading" className="space-y-2.5">
        <SectionHeader
          heading="h3"
          title="対応が必要"
          description="承認待ち・入力待ち・失敗・復旧が必要な仕事"
        />
        <div className="animate-stagger space-y-2">
          {attention.map((item) => (
            <AttentionCard
              key={item.id}
              kind={item.kind}
              title={item.title}
              description={item.description}
              href={item.href}
              actionLabel={item.actionLabel}
              meta={
                item.meta
                  ? `更新: ${formatNextRunDateTime(item.meta)}`
                  : null
              }
              onOpen={() =>
                trackAutomationFirstEvent("attention_item_opened", {
                  kind: item.kind,
                  id: item.id,
                })
              }
            />
          ))}
        </div>
      </section>
    ) : null;

  const timelineSection =
    timeline.length > 0 ? (
      <section aria-labelledby="af-timeline-heading" className="space-y-2.5">
        <SectionHeader
          heading="h3"
          title="今日MINERVOTが行う仕事"
          description="実行予定・実行中・完了"
          action={
            <Link
              href="/today"
              className="inline-flex min-h-[var(--touch-target)] items-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
            >
              すべて見る
            </Link>
          }
        />
        <Timeline
          items={timeline}
          onItemOpen={(id) =>
            trackAutomationFirstEvent("run_detail_opened", {
              id,
              source: "home_timeline",
            })
          }
        />
      </section>
    ) : null;

  const nextRunCard = nextRun ? (
    <section
      aria-labelledby="af-next-run-heading"
      className="animate-card-enter rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5"
    >
      <h3
        id="af-next-run-heading"
        className="text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]"
      >
        次回実行
      </h3>
      <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">
        {nextRun.name}
      </p>
      <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
        {formatNextRunDateTime(nextRun.nextRunAt)}
      </p>
      <Link
        href={nextRun.href}
        className="mt-2 inline-flex min-h-[var(--touch-target)] items-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
      >
        詳細を見る
      </Link>
    </section>
  ) : summary.nextJob ? (
    <section
      aria-labelledby="af-next-run-heading"
      className="animate-card-enter rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5"
    >
      <h3
        id="af-next-run-heading"
        className="text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]"
      >
        次回実行
      </h3>
      <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">
        {summary.nextJob.title}
      </p>
      <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
        {summary.nextJob.scheduledTime ?? summary.nextJob.scheduleLabel ?? "—"}
      </p>
    </section>
  ) : null;

  const recentSection =
    recentCompleted.length > 0 ? (
      <section aria-labelledby="af-completed-heading" className="space-y-2.5">
        <SectionHeader heading="h3" title="最近完成したもの" />
        <ul className="animate-stagger divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)]">
          {recentCompleted.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {item.title}
                </p>
                <p className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
                  {item.detail}
                  {item.meta ? ` · ${item.meta}` : ""}
                </p>
              </div>
              <Link
                href={item.href}
                onClick={() =>
                  trackAutomationFirstEvent("artifact_opened", {
                    id: item.id,
                    source: "home_completed",
                  })
                }
                className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
              >
                確認
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const dashboardHasContent = Boolean(
    attentionSection ||
      timelineSection ||
      runningJobs.length > 0 ||
      nextRunCard ||
      recentSection ||
      (opsSummary && hasMeaningfulWeeklyStats(weeklyStats)),
  );

  return (
    <div className="automation-first-home space-y-6 pb-6 sm:space-y-8">
      <header className="space-y-1.5">
        <p className="text-[length:var(--text-label)] font-semibold tracking-[0.08em] text-[var(--brand)]">
          {greetingForHour(now.getHours())}
        </p>
        <h1 className="text-[length:var(--text-page-title)] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[length:var(--text-display)]">
          毎日のX投稿を、自動化します
        </h1>
        <p className="text-[length:var(--text-caption)] text-[var(--text-secondary)] sm:text-[length:var(--text-body)]">
          {formatTodayDateLabel(now)}
          {" — "}
          一度頼めば、あとは確認するだけ。
        </p>
      </header>

      <HomePrimaryActions compact={isReturningUser} />

      {!isReturningUser ? (
        <p className="text-center text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--text-secondary)]">
          まずX投稿を自動化してみましょう。使うほど、毎回の細かい指示が減ります。
        </p>
      ) : (
        <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          使うほど、毎回の細かい指示が減ります。
        </p>
      )}

      {opsError ? (
        <ErrorState
          title="運用データを取得できませんでした"
          description="確認不能のため、0件としては表示していません。"
          onRetry={() => {
            setOpsRequestId((value) => value + 1);
          }}
        />
      ) : null}

      {showDashboardSkeleton ? <HomeSkeleton /> : null}

      {!showDashboardSkeleton && dashboardHasContent ? (
        <section
          aria-labelledby="af-today-minervot-heading"
          className="space-y-5"
        >
          <h2
            id="af-today-minervot-heading"
            className="text-[length:var(--text-section)] font-semibold tracking-tight text-[var(--text-primary)]"
          >
            今日のMINERVOT
          </h2>
          {attentionSection}
          <RunningStepsPanel
            heading="h3"
            jobs={runningJobs}
            onOpen={(id) =>
              trackAutomationFirstEvent("run_detail_opened", {
                id,
                source: "home_running",
              })
            }
          />
          {timelineSection}
          {nextRunCard}
          {recentSection}
          {opsSummary && hasMeaningfulWeeklyStats(weeklyStats) ? (
            <WeeklyStatsCard stats={weeklyStats} />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
