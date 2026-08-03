"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AttentionCard } from "@/components/automation-first/attention-card";
import { EmptyQuickStart } from "@/components/automation-first/empty-quick-start";
import { ErrorState } from "@/components/automation-first/error-state";
import { SectionHeader } from "@/components/automation-first/page-header";
import { RunningStepsPanel } from "@/components/automation-first/running-steps";
import { SecretaryDashboard } from "@/components/automation-first/secretary-dashboard";
import { Timeline } from "@/components/automation-first/timeline";
import { WorkCompletionList } from "@/components/automation-first/work-completion-list";
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
import { cn } from "@/lib/design-system/cn";
import {
  buildSecretaryRoi,
  buildWorkCompletionItems,
  computeSecretaryLevel,
  estimateSavedMinutesFromCompletions,
  evaluateRetention,
  markRetentionEmitted,
  trackFirstValueEvent,
} from "@/lib/first-value";
import { buildSecretaryProactiveItems } from "@/lib/home/secretary-proactive";

export type AutomationFirstHomeProps = {
  automations: Automation[];
  projects: Project[];
};

function StatChip({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border px-3 py-2.5",
        emphasize
          ? "border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-[var(--warning-bg)]"
          : "border-[var(--border)] bg-[var(--surface-elevated)]",
      )}
    >
      <p className="text-[length:var(--text-label)] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy aria-label="読み込み中">
      <div className="h-10 w-48 rounded bg-[var(--surface-muted)]" />
      <div className="h-40 rounded-[var(--radius-xl)] bg-[var(--surface-muted)]" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-64 rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
        <div className="h-64 rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
      </div>
    </div>
  );
}

function CtaBlock({
  createHref,
  oneTimeHref,
  primary = true,
}: {
  createHref: string;
  oneTimeHref: string;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={createHref}
        onClick={() =>
          trackAutomationFirstEvent("primary_automation_cta_clicked", {
            source: primary ? "home_main" : "home_side",
          })
        }
        className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--brand-foreground)]"
      >
        新しい自動化を作る
      </Link>
      <Link
        href={oneTimeHref}
        onClick={() =>
          trackAutomationFirstEvent("one_time_request_clicked", {
            source: primary ? "home_main" : "home_side",
          })
        }
        className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-medium text-[var(--text-primary)]"
      >
        一度だけお願いする
      </Link>
    </div>
  );
}

function WeeklyStatsCard({ stats }: { stats: HomeWeeklyStats }) {
  return (
    <section
      aria-labelledby="af-week-heading"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
    >
      <h2
        id="af-week-heading"
        className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
      >
        今週の実績
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[var(--text-muted)]">完了した仕事</dt>
          <dd className="text-lg font-semibold tabular-nums">{stats.completedJobs}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">成功率</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {stats.successRatePercent == null ? "—" : `${stats.successRatePercent}%`}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">成果物</dt>
          <dd className="text-lg font-semibold tabular-nums">{stats.artifactCount}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">自動実行したStep</dt>
          <dd className="text-lg font-semibold tabular-nums">{stats.autoStepCount}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        操作を省略した推定回数: {stats.estimatedSkippedActions}
      </p>
      {stats.savedMinutes != null ? (
        <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
          節約時間（測定値）: 約{stats.savedMinutes}分
        </p>
      ) : null}
    </section>
  );
}

export function AutomationFirstHome({
  automations,
  projects,
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
        // Fail closed: do not treat fetch failure as zero runs.
        setOpsSummary(null);
        setRuns([]);
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

  const workCompletions = useMemo(
    () => buildWorkCompletionItems(recentCompleted),
    [recentCompleted],
  );

  const suggestion = useMemo(() => {
    const items = buildSecretaryProactiveItems({
      projects,
      automations,
      notifications: [],
      now,
    });
    // Exactly one suggestion — never a pile.
    return items[0] ?? null;
  }, [projects, automations, now]);

  const todayCompleted = summary.completedRuns;
  const estimatedTodayMinutes = estimateSavedMinutesFromCompletions(todayCompleted);
  const estimatedWeekMinutes = estimateSavedMinutesFromCompletions(
    weeklyStats.completedJobs,
  );
  const roi = useMemo(() => {
    const todayMinutes =
      weeklyStats.savedMinutes != null
        ? Math.round(weeklyStats.savedMinutes / 7)
        : estimatedTodayMinutes;
    const weekMinutes = weeklyStats.savedMinutes ?? estimatedWeekMinutes;
    return buildSecretaryRoi({
      todayMinutesSaved: todayMinutes,
      weekMinutesSaved: weekMinutes,
      monthMinutesSaved:
        weeklyStats.savedMinutes != null
          ? weeklyStats.savedMinutes * 4
          : weekMinutes * 4,
      measured: weeklyStats.savedMinutes != null,
    });
  }, [weeklyStats.savedMinutes, estimatedTodayMinutes, estimatedWeekMinutes]);

  const memoryUseCount = useMemo(
    () =>
      runs.reduce(
        (sum, run) =>
          sum +
          (run.memoryUsage?.memoryIdsUsed?.length ??
            run.memoryUsage?.used?.length ??
            0),
        0,
      ),
    [runs],
  );

  const secretaryLevel = useMemo(
    () =>
      computeSecretaryLevel({
        automationCount: automations.length,
        hoursSaved: roi.monthHoursSaved,
        memoryActiveCount: memoryUseCount,
      }),
    [automations.length, roi.monthHoursSaved, memoryUseCount],
  );

  const funnelTracked = useRef(false);
  useEffect(() => {
    trackAutomationFirstEvent("home_viewed", {
      automations: automations.length,
      active: summary.activeAutomationCount,
      attention: summary.attentionCount,
      ops: Boolean(opsSummary),
    });
    if (funnelTracked.current) return;
    funnelTracked.current = true;
    trackFirstValueEvent("registration_home_viewed", {
      automations: automations.length,
    });
    if (automations.length === 0) {
      trackFirstValueEvent("empty_home_viewed", { source: "automation_first" });
    }

    const retention = evaluateRetention(now);
    if (retention.emitDay7) {
      trackFirstValueEvent("day7_return", {
        days: retention.daysSinceFirstSeen,
      });
      markRetentionEmitted("day7");
    }
    if (retention.emitDay30) {
      trackFirstValueEvent("day30_return", {
        days: retention.daysSinceFirstSeen,
      });
      markRetentionEmitted("day30");
    }

    trackFirstValueEvent("automation_rate_snapshot", {
      automations: automations.length,
      successRate: weeklyStats.successRatePercent,
    });
    trackFirstValueEvent("memory_rate_snapshot", {
      memoryUseCount,
      memoryCompletionRate: secretaryLevel.memoryCompletionRate,
    });
  }, [
    automations.length,
    summary.activeAutomationCount,
    summary.attentionCount,
    opsSummary,
    now,
    weeklyStats.successRatePercent,
    memoryUseCount,
    secretaryLevel.memoryCompletionRate,
  ]);

  const hasAutomations = automations.length > 0 || (opsSummary?.counts.activeAutomations ?? 0) > 0;
  const createHref = "/automations/new";
  const oneTimeHref = "/workspace";

  const secretaryDashboard = (
    <SecretaryDashboard
      todayCompleted={todayCompleted}
      todayHoursSaved={roi.todayHoursSaved}
      runningCount={summary.runningRuns}
      todayScheduled={summary.todayScheduledRuns}
      suggestion={suggestion}
      roi={roi}
      level={secretaryLevel}
      automationSuccessRate={weeklyStats.successRatePercent}
      memoryUseCount={memoryUseCount}
    />
  );

  const emptyQuickStart = <EmptyQuickStart oneTimeHref={oneTimeHref} />;

  const completionSection =
    workCompletions.length > 0 ? (
      <WorkCompletionList items={workCompletions} />
    ) : null;

  if (opsEnabled && opsLoading && !opsSummary && !opsError) {
    return <HomeSkeleton />;
  }

  const attentionSection =
    attention.length > 0 ? (
      <section aria-labelledby="af-attention-heading" className="space-y-3">
        <SectionHeader
          title="対応が必要です"
          description="承認・入力・失敗の復旧など、いま触る必要がある項目"
        />
        <div className="space-y-3">
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
      <section aria-labelledby="af-timeline-heading" className="space-y-3">
        <SectionHeader
          title="今日MINERVOTが行う仕事"
          description="時刻・状態・現在の手順・次の操作"
          action={
            <Link
              href="/today"
              className="text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
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
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
    >
      <h2
        id="af-next-run-heading"
        className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
      >
        次回実行
      </h2>
      <p className="mt-2 text-[length:var(--text-card-title)] font-semibold text-[var(--text-primary)]">
        {nextRun.name}
      </p>
      <p className="mt-1 text-[length:var(--text-body)] text-[var(--text-secondary)]">
        {formatNextRunDateTime(nextRun.nextRunAt)}
      </p>
      <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        実行方針は自動化の設定に従います
      </p>
      <Link
        href={nextRun.href}
        className="mt-3 inline-flex min-h-[var(--touch-target)] items-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
      >
        詳細を見る
      </Link>
    </section>
  ) : summary.nextJob ? (
    <section
      aria-labelledby="af-next-run-heading"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
    >
      <h2
        id="af-next-run-heading"
        className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
      >
        次回実行
      </h2>
      <p className="mt-2 font-semibold text-[var(--text-primary)]">
        {summary.nextJob.title}
      </p>
      <p className="mt-1 text-[length:var(--text-body)] text-[var(--text-secondary)]">
        {summary.nextJob.scheduledTime ?? summary.nextJob.scheduleLabel ?? "—"}
      </p>
    </section>
  ) : null;

  return (
    <div className="automation-first-home space-y-8 pb-8 sm:space-y-10">
      <header className="space-y-3">
        <p className="text-[length:var(--text-label)] font-semibold tracking-[0.08em] text-[var(--brand)]">
          MINERVOT
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[length:var(--text-display)] font-semibold tracking-tight text-[var(--text-primary)]">
              {greetingForHour(now.getHours())}
            </h1>
            <p className="mt-1 text-[length:var(--text-body)] text-[var(--text-secondary)]">
              {formatTodayDateLabel(now)}
              {" — "}
              会話ではなく、仕事が終わるAI秘書です
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <StatChip label="稼働中の自動化" value={summary.activeAutomationCount} />
            <StatChip
              label="対応が必要"
              value={summary.attentionItemCount}
              emphasize={summary.attentionItemCount > 0}
            />
          </div>
        </div>
      </header>

      {secretaryDashboard}

      {opsError ? (
        <ErrorState
          description={`運用データの取得に失敗しました: ${opsError}`}
          onRetry={() => {
            setOpsRequestId((value) => value + 1);
          }}
        />
      ) : null}

      {/* Mobile order: dashboard → empty/create → attention → today → completion */}
      <div className="space-y-8 lg:hidden">
        {!hasAutomations ? (
          emptyQuickStart
        ) : (
          <CtaBlock createHref={createHref} oneTimeHref={oneTimeHref} />
        )}
        {attentionSection}
        {timelineSection}
        <RunningStepsPanel
          jobs={runningJobs}
          onOpen={(id) =>
            trackAutomationFirstEvent("run_detail_opened", {
              id,
              source: "home_running_mobile",
            })
          }
        />
        {nextRunCard}
        {completionSection}
        {opsSummary ? <WeeklyStatsCard stats={weeklyStats} /> : null}
      </div>

      {/* PC: main + right rail */}
      <div className="hidden gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="space-y-8">
          {!hasAutomations ? emptyQuickStart : null}

          <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-sm)]">
            <p className="text-[length:var(--text-label)] font-medium text-[var(--text-muted)]">
              今日の仕事
            </p>
            <h2 className="mt-1 text-[length:var(--text-page-title)] font-semibold tracking-tight text-[var(--text-primary)]">
              今日、MINERVOTが行う仕事
            </h2>
            {hasAutomations ? (
              <div className="mt-5 grid grid-cols-3 gap-2 xl:grid-cols-6">
                <StatChip label="予定" value={summary.todayScheduledRuns} />
                <StatChip label="実行中" value={summary.runningRuns} />
                <StatChip label="承認待ち" value={summary.awaitingApprovalRuns} />
                <StatChip label="入力待ち" value={summary.needsInputRuns} />
                <StatChip label="完了" value={summary.completedRuns} />
                <StatChip label="失敗" value={summary.failedRuns} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                上の Quick Start から最初の仕事を任せると、ここに今日の進み具合が表示されます。
              </p>
            )}
          </section>

          {timelineSection}
          <RunningStepsPanel
            jobs={runningJobs}
            onOpen={(id) =>
              trackAutomationFirstEvent("run_detail_opened", {
                id,
                source: "home_running",
              })
            }
          />
          {completionSection}
        </div>

        <aside className="space-y-5">
          {attentionSection}
          {hasAutomations ? (
            <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
              <h2 className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]">
                自動化を作る
              </h2>
              <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                主役は自動化。単発のお願いも残せます。
              </p>
              <div className="mt-3">
                <CtaBlock
                  createHref={createHref}
                  oneTimeHref={oneTimeHref}
                  primary={false}
                />
              </div>
            </section>
          ) : null}
          {nextRunCard}
          {opsSummary ? <WeeklyStatsCard stats={weeklyStats} /> : null}
        </aside>
      </div>
    </div>
  );
}
