"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AnimatedNumber } from "@/components/motion/animated-number";
import { ContentSwap } from "@/components/motion/content-swap";
import { RevealStagger } from "@/components/motion/reveal-stagger";
import { MOTION_PLAY_KEYS } from "@/lib/motion/tokens";
import { AttentionCard } from "@/components/automation-first/attention-card";
import {
  EntrustedWorkList,
  MeasuredValueMetrics,
  NewUserValueSteps,
} from "@/components/automation-first/entrusted-work";
import { ErrorState } from "@/components/automation-first/error-state";
import { HomePrimaryActions } from "@/components/automation-first/home-primary-actions";
import {
  HomeCoreBadge,
  HomeStatusCore,
} from "@/components/automation-first/home-status-core";
import { WorkCountStrip, YourWorkList } from "@/components/automation-first/your-work";
import { PageHeader, SectionHeader } from "@/components/automation-first/page-header";
import { RecentDeliverables } from "@/components/automation-first/recent-deliverables";
import { RunningStepsPanel } from "@/components/automation-first/running-steps";
import { Timeline } from "@/components/automation-first/timeline";
import { EntrustProposalList } from "@/components/work-loop/entrust-proposal";
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
  HOME_COMPLETED_HOLD_MS,
  deriveHomeCoreState,
  type HomeCompletedRun,
} from "@/lib/automation-first/home-core-state";
import { useLiveOpsRefresh } from "@/lib/automation-first/use-live-ops-refresh";
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
import { fetchXAutoPostStatusClient } from "@/lib/integrations/x/post/autopost-client";
import {
  countSuccessfulFinishedWorkThisMonth,
  formatFinishedWorkThisMonthLine,
} from "@/lib/product-focus/finished-work";
import {
  HOME_X_AUTOMATION_SUPPORT,
  MEMORY_OUTCOME,
} from "@/lib/product-focus/messaging";
import { buildEntrustedWorkCards } from "@/lib/value-moat/home-entrusted";
import { buildValueMetrics } from "@/lib/value-moat/value-metrics";
import { toWorkAsset, workCounts } from "@/lib/work-asset/work-view";

export type AutomationFirstHomeProps = {
  automations: Automation[];
  projects: Project[];
  /** Reload automations after a pause / resume / run-now from the home. */
  onAutomationsChanged?: () => void;
};

function HomeSkeleton() {
  return (
    <div className="min-h-[12rem] space-y-4" aria-busy aria-label="読み込み中">
      <div className="h-8 w-48 animate-shimmer rounded bg-[var(--surface-muted)]" />
      <div className="h-40 animate-shimmer rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
    </div>
  );
}

function WeeklyStatsCard({ stats }: { stats: HomeWeeklyStats }) {
  return (
    <section
      aria-labelledby="af-week-heading"
      className="animate-card-enter ui-card ui-card-pad"
    >
      <h3
        id="af-week-heading"
        className="text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]"
      >
        今週の実績
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            完了した仕事
          </dt>
          <dd className="text-base font-semibold tabular-nums">
            <AnimatedNumber value={stats.completedJobs} />
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            成功率
          </dt>
          <dd className="text-base font-semibold tabular-nums">
            {stats.successRatePercent == null ? (
              "—"
            ) : (
              <AnimatedNumber value={stats.successRatePercent} suffix="%" />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            完成したもの
          </dt>
          <dd className="text-base font-semibold tabular-nums">
            <AnimatedNumber value={stats.artifactCount} />
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            自動で進めた手順
          </dt>
          <dd className="text-base font-semibold tabular-nums">
            <AnimatedNumber value={stats.autoStepCount} />
          </dd>
        </div>
        {stats.savedMinutes != null && stats.savedMinutes > 0 ? (
          <div>
            <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
              任せた時間
            </dt>
            <dd className="flex items-baseline gap-1 text-base font-semibold tabular-nums">
              <IconClock className="h-3.5 w-3.5 text-[var(--brand)]" />
              <AnimatedNumber value={stats.savedMinutes} />
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
  projects,
  onAutomationsChanged,
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
  const [xPostedThisMonth, setXPostedThisMonth] = useState<number | null>(null);
  const [justCompleted, setJustCompleted] = useState<HomeCompletedRun | null>(null);

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

  const { refreshNow: refreshOpsNow } = useLiveOpsRefresh({
    enabled: opsEnabled,
    runs,
    onUpdate: ({ summary, runs: nextRuns, completed }) => {
      setOpsSummary(summary);
      setRuns(nextRuns);
      if (completed) {
        setJustCompleted(completed);
        trackAutomationFirstEvent("home_run_completed_live", {
          id: completed.runId,
        });
      }
    },
  });

  useEffect(() => {
    if (!justCompleted) return;
    const timer = window.setTimeout(
      () => setJustCompleted(null),
      HOME_COMPLETED_HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [justCompleted]);

  useEffect(() => {
    let cancelled = false;
    void fetchXAutoPostStatusClient()
      .then((result) => {
        if (cancelled) return;
        if (result.status === "ready") {
          setXPostedThisMonth(result.postedThisMonth);
        }
      })
      .catch(() => {
        if (!cancelled) setXPostedThisMonth(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        url: artifact.url,
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
  const works = useMemo(
    () => automations.map((automation) => toWorkAsset(automation)),
    [automations],
  );
  const counts = useMemo(() => workCounts(works), [works]);

  const entrustedCards = useMemo(
    () =>
      buildEntrustedWorkCards({
        automations: automations.map((automation) => ({
          id: automation.id,
          name: automation.name,
          enabled: automation.enabled,
          nextRun: automation.nextRun,
          scheduleLabel:
            automation.schedule && "label" in automation.schedule
              ? automation.schedule.label
              : null,
        })),
        recentCompleted: recentCompleted.map((item) => ({
          id: item.id,
          title: item.title,
          completedAt: item.meta || null,
          href: item.href,
        })),
      }),
    [automations, recentCompleted],
  );

  const valueMetrics = useMemo(
    () =>
      opsSummary
        ? buildValueMetrics({
            completedThisMonth: weeklyStats.completedJobs,
            autoRunsThisMonth: weeklyStats.autoStepCount,
          })
        : [],
    [opsSummary, weeklyStats.autoStepCount, weeklyStats.completedJobs],
  );

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
          id="af-attention-heading"
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
          id="af-timeline-heading"
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

  const nextRunInfo = nextRun
    ? {
        name: nextRun.name,
        when: formatNextRunDateTime(nextRun.nextRunAt),
        href: nextRun.href as string | null,
      }
    : summary.nextJob
      ? {
          name: summary.nextJob.title,
          when:
            summary.nextJob.scheduledTime ?? summary.nextJob.scheduleLabel ?? "—",
          href: summary.nextJob.href ?? null,
        }
      : null;

  const nextRunBody = nextRunInfo ? (
    <>
      <span className="ui-icon-tile" aria-hidden>
        <IconClock className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          id="af-next-run-heading"
          className="block text-[length:var(--text-meta)] font-semibold text-[var(--text-muted)]"
        >
          次回実行
        </span>
        <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
          {nextRunInfo.name}
        </span>
        <span className="block text-[length:var(--text-caption)] text-[var(--text-secondary)]">
          {nextRunInfo.when}
        </span>
      </span>
      {nextRunInfo.href ? <span aria-hidden className="ui-chevron">›</span> : null}
    </>
  ) : null;

  const nextRunCard = nextRunInfo ? (
    <section aria-labelledby="af-next-run-heading" className="animate-card-enter">
      {nextRunInfo.href ? (
        <Link
          href={nextRunInfo.href}
          className="ui-card ui-card-interactive ui-row focus-ring"
        >
          {nextRunBody}
        </Link>
      ) : (
        <div className="ui-card ui-row">{nextRunBody}</div>
      )}
    </section>
  ) : null;

  const recentSection =
    recentCompleted.length > 0 ? <RecentDeliverables items={recentCompleted} /> : null;

  const coreState = useMemo(
    () =>
      deriveHomeCoreState({
        justCompleted,
        checking: opsEnabled && opsLoading && !opsSummary && !opsError,
        attentionCount: attention.length,
        runningCount: runningJobs.length,
        runningTitle: runningJobs[0]?.title ?? null,
        nextRun: nextRun
          ? {
              name: nextRun.name,
              whenLabel: formatNextRunDateTime(nextRun.nextRunAt),
            }
          : summary.nextJob
            ? {
                name: summary.nextJob.title,
                whenLabel:
                  summary.nextJob.scheduledTime ??
                  summary.nextJob.scheduleLabel ??
                  null,
              }
            : null,
        entrustedCount: counts.entrusted,
      }),
    [
      justCompleted,
      opsEnabled,
      opsLoading,
      opsSummary,
      opsError,
      attention.length,
      runningJobs,
      nextRun,
      summary.nextJob,
      counts.entrusted,
    ],
  );

  const showCore =
    isReturningUser ||
    coreState.kind === "checking" ||
    coreState.kind === "completed";

  const dashboardHasContent = Boolean(
    attentionSection ||
      timelineSection ||
      runningJobs.length > 0 ||
      nextRunCard ||
      recentSection ||
      works.length > 0 ||
      entrustedCards.length > 0 ||
      valueMetrics.length > 0 ||
      (opsSummary && hasMeaningfulWeeklyStats(weeklyStats)),
  );

  const finishedLine = formatFinishedWorkThisMonthLine(
    countSuccessfulFinishedWorkThisMonth({
      projects,
      automations,
      xAutoPostsPostedThisMonth: xPostedThisMonth ?? 0,
      now,
    }),
  );

  return (
    <RevealStagger
      playKey={MOTION_PLAY_KEYS.homeIntro}
      className="automation-first-home space-y-6 pb-6 sm:space-y-8"
    >
      <PageHeader
        eyebrow={
          <>
            {showCore ? null : <HomeCoreBadge />}
            {greetingForHour(now.getHours())}
          </>
        }
        title="毎日のX投稿を、一度頼んだら次から任せます"
        description={
          <>
            {formatTodayDateLabel(now)}
            {isReturningUser ? null : ` — ${HOME_X_AUTOMATION_SUPPORT}`}
          </>
        }
      />

      <div
        className={
          showCore
            ? "grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start [&>*]:min-w-0"
            : "space-y-3"
        }
      >
        {showCore ? <HomeStatusCore state={coreState} /> : null}
        <HomePrimaryActions compact={isReturningUser} />
      </div>

      {!isReturningUser ? (
        <>
          <NewUserValueSteps />
          <p className="text-center text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--text-secondary)]">
            まず毎日のX投稿を任せてみましょう。{MEMORY_OUTCOME}。
          </p>
        </>
      ) : (
        <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {finishedLine ? `${finishedLine} · ` : ""}
          {MEMORY_OUTCOME}。普段は任せて、必要なときだけ確認。
        </p>
      )}
      {!isReturningUser && finishedLine ? (
        <p className="text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {finishedLine}
        </p>
      ) : null}

      <EntrustProposalList
        projects={projects}
        automations={automations}
        userId={automations[0]?.userId ?? "local"}
      />

      {opsError ? (
        <ErrorState
          title="運用データを取得できませんでした"
          description="確認不能のため、0件としては表示していません。"
          onRetry={() => {
            setOpsRequestId((value) => value + 1);
          }}
        />
      ) : null}

      <ContentSwap ready={!showDashboardSkeleton} pending={<HomeSkeleton />}>
      {dashboardHasContent ? (
        <section aria-labelledby="af-today-minervot-heading" className="space-y-4">
          <h2 id="af-today-minervot-heading" className="ui-section-title">
            今日のMINERVOT
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-6">
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
              {recentSection}
              {timelineSection}
              <YourWorkList
                works={works}
                onChanged={() => {
                  onAutomationsChanged?.();
                  refreshOpsNow();
                }}
              />
            </div>
            <aside className="min-w-0 space-y-6" aria-label="任せている仕事の状況">
              <WorkCountStrip
                entrusted={counts.entrusted}
                completedThisWeek={
                  opsSummary && weeklyStats.completedJobs > 0
                    ? weeklyStats.completedJobs
                    : null
                }
                needsAttention={counts.needsAttention + attention.length}
              />
              {nextRunCard}
              <EntrustedWorkList cards={entrustedCards} />
              {valueMetrics.length > 0 ? (
                <MeasuredValueMetrics metrics={valueMetrics} />
              ) : null}
              {opsSummary && hasMeaningfulWeeklyStats(weeklyStats) ? (
                <WeeklyStatsCard stats={weeklyStats} />
              ) : null}
            </aside>
          </div>
        </section>
      ) : null}
      </ContentSwap>
    </RevealStagger>
  );
}
