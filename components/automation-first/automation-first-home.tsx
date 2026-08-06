"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AttentionCard } from "@/components/automation-first/attention-card";
import { EmptyState } from "@/components/automation-first/empty-state";
import { ErrorState } from "@/components/automation-first/error-state";
import { SectionHeader } from "@/components/automation-first/page-header";
import { RunningStepsPanel } from "@/components/automation-first/running-steps";
import { Timeline } from "@/components/automation-first/timeline";
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconEmptyWork,
  IconSpark,
} from "@/components/ui/icons";
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

export type AutomationFirstHomeProps = {
  automations: Automation[];
  projects: Project[];
};

function HeroStat({
  label,
  value,
  unit,
  live,
  icon,
  hint,
}: {
  label: string;
  value: number;
  unit?: string;
  live?: boolean;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <div
      className="stat-tile animate-card-enter"
      data-live={live ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[length:var(--text-meta)] font-medium tracking-wide text-[var(--text-muted)]">
          {label}
        </p>
        <span
          className={cn(
            "text-[var(--brand)]",
            live && "opacity-100",
            !live && "opacity-70",
          )}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        {live ? <span className="stat-dot" aria-hidden /> : null}
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)] sm:text-[1.65rem]">
          {value}
        </p>
        {unit ? (
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1 text-[length:var(--text-meta)] leading-snug text-[var(--text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy aria-label="読み込み中">
      <div className="h-8 w-40 rounded bg-[var(--surface-muted)]" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[4.5rem] rounded-[var(--radius-md)] bg-[var(--surface-muted)]"
          />
        ))}
      </div>
      <div className="h-48 rounded-[var(--radius-lg)] bg-[var(--surface-muted)]" />
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
    <div className="flex flex-col gap-2 sm:flex-row">
      <Link
        href={createHref}
        onClick={() =>
          trackAutomationFirstEvent("primary_automation_cta_clicked", {
            source: primary ? "home_main" : "home_side",
          })
        }
        className="btn-brand"
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
        className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-medium text-[var(--text-primary)] transition-all duration-[var(--motion-fast)] hover:bg-[var(--secondary-hover)] active:scale-[0.98]"
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
      className="animate-card-enter rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5"
    >
      <h2
        id="af-week-heading"
        className="text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]"
      >
        今週の実績
      </h2>
      <dl className="mt-2.5 grid grid-cols-2 gap-2.5 text-sm">
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
            成果物
          </dt>
          <dd className="text-base font-semibold tabular-nums">
            {stats.artifactCount}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            自動実行したStep
          </dt>
          <dd className="text-base font-semibold tabular-nums">
            {stats.autoStepCount}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Display-only: prefer measured minutes, else proxy from existing skip estimate. */
function savedMinutesDisplay(
  weekly: HomeWeeklyStats,
  completedToday: number,
): number {
  if (weekly.savedMinutes != null) return weekly.savedMinutes;
  if (weekly.estimatedSkippedActions > 0) {
    return weekly.estimatedSkippedActions;
  }
  return completedToday * 5;
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
  const createHref = "/automations/new";
  const oneTimeHref = "/workspace";

  const runningCount = summary.runningRuns;
  const awaitingCount = Math.max(
    summary.awaitingApprovalRuns + summary.needsInputRuns,
    summary.attentionItemCount,
  );
  const completedToday = summary.completedRuns;
  const savedMinutes = savedMinutesDisplay(weeklyStats, completedToday);

  if (opsEnabled && opsLoading && !opsSummary && !opsError) {
    return <HomeSkeleton />;
  }

  const attentionSection =
    attention.length > 0 ? (
      <section aria-labelledby="af-attention-heading" className="space-y-2.5">
        <SectionHeader
          title="対応が必要です"
          description="承認・入力・失敗の復旧など、いま触る必要がある項目"
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
      className="animate-card-enter rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5"
    >
      <h2
        id="af-next-run-heading"
        className="text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]"
      >
        次回実行
      </h2>
      <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">
        {nextRun.name}
      </p>
      <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
        {formatNextRunDateTime(nextRun.nextRunAt)}
      </p>
      <Link
        href={nextRun.href}
        className="mt-2 inline-flex min-h-[40px] items-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
      >
        詳細を見る
      </Link>
    </section>
  ) : summary.nextJob ? (
    <section
      aria-labelledby="af-next-run-heading"
      className="animate-card-enter rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5"
    >
      <h2
        id="af-next-run-heading"
        className="text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]"
      >
        次回実行
      </h2>
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
        <SectionHeader title="最近完了した仕事" />
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
                className="shrink-0 text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
              >
                確認
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="automation-first-home space-y-5 pb-6 sm:space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[length:var(--text-label)] font-semibold tracking-[0.1em] text-[var(--brand)]">
              MINERVOT
            </p>
            <h1 className="mt-0.5 text-[length:var(--text-page-title)] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[length:var(--text-display)]">
              {greetingForHour(now.getHours())}
            </h1>
            <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-secondary)] sm:text-[length:var(--text-body)]">
              {formatTodayDateLabel(now)}
              {" — "}
              今日、AI秘書が仕事を進めています
            </p>
          </div>
        </div>

        {/* Priority strip — AI稼働中 / 確認待ち / 今日完了 / 今日節約時間 */}
        <div
          className="animate-stagger grid grid-cols-2 gap-2 sm:grid-cols-4"
          aria-label="今日のAI稼働状況"
        >
          <HeroStat
            label="AI稼働中"
            value={runningCount}
            unit="件"
            live={runningCount > 0}
            icon={<IconSpark className="h-4 w-4" />}
            hint={
              runningCount > 0
                ? "いま処理を進めています"
                : "待機中 — 予定どおり動きます"
            }
          />
          <HeroStat
            label="確認待ち"
            value={awaitingCount}
            unit="件"
            live={awaitingCount > 0}
            icon={<IconAlert className="h-4 w-4" />}
            hint={
              awaitingCount > 0
                ? "あなたの判断が必要です"
                : "今すぐ対応する項目はありません"
            }
          />
          <HeroStat
            label="今日完了"
            value={completedToday}
            unit="件"
            icon={<IconCheck className="h-4 w-4" />}
            hint={
              completedToday > 0
                ? "すでに仕上げた仕事"
                : "完了するとここに積み上がります"
            }
          />
          <HeroStat
            label="今日節約時間"
            value={savedMinutes}
            unit="分"
            icon={<IconClock className="h-4 w-4" />}
            hint={
              savedMinutes > 0
                ? "AIが肩代わりした時間"
                : "動き出すと節約分が表示されます"
            }
          />
        </div>
      </header>

      {opsError ? (
        <ErrorState
          description={`運用データの取得に失敗しました: ${opsError}`}
          onRetry={() => {
            setOpsRequestId((value) => value + 1);
          }}
        />
      ) : null}

      <div className="space-y-5 lg:hidden">
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
        {!hasAutomations ? (
          <EmptyState
            title="最初の仕事をAIに任せましょう"
            description="繰り返す仕事を一度設定すると、MINERVOTが予定どおり進めます。朝のメールや投稿から始めるのがおすすめです。"
            primaryHref={createHref}
            primaryLabel="新しい自動化を作る"
            secondaryHref={oneTimeHref}
            secondaryLabel="一度だけお願いする"
            onPrimaryClick={() =>
              trackAutomationFirstEvent("empty_state_cta_clicked", {
                source: "home_empty",
              })
            }
            className="border-[var(--border)] bg-[linear-gradient(180deg,var(--surface-elevated),var(--surface-muted))]"
          />
        ) : (
          <CtaBlock createHref={createHref} oneTimeHref={oneTimeHref} />
        )}
        {nextRunCard}
        {recentSection}
        {opsSummary ? <WeeklyStatsCard stats={weeklyStats} /> : null}
      </div>

      <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <div className="space-y-5">
          {timelineSection ?? (
            <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-5 py-8 text-center">
              <IconEmptyWork className="mx-auto text-[var(--brand)] opacity-70" />
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                今日のタイムラインはまだ静かです
              </p>
              <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                自動化を設定すると、ここに進行が表示されます。
              </p>
            </section>
          )}
          <RunningStepsPanel
            jobs={runningJobs}
            onOpen={(id) =>
              trackAutomationFirstEvent("run_detail_opened", {
                id,
                source: "home_running",
              })
            }
          />
          {recentSection}
          {!hasAutomations ? (
            <EmptyState
              title="最初の仕事をAIに任せましょう"
              description="繰り返す仕事を一度設定すると、MINERVOTが予定どおり進めます。"
              primaryHref={createHref}
              primaryLabel="新しい自動化を作る"
              secondaryHref={oneTimeHref}
              secondaryLabel="一度だけお願いする"
              onPrimaryClick={() =>
                trackAutomationFirstEvent("empty_state_cta_clicked", {
                  source: "home_empty",
                })
              }
            />
          ) : null}
        </div>

        <aside className="space-y-4">
          {attentionSection}
          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5">
            <h2 className="text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]">
              自動化を作る
            </h2>
            <p className="mt-1 text-[length:var(--text-meta)] text-[var(--text-muted)]">
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
          {nextRunCard}
          {opsSummary ? <WeeklyStatsCard stats={weeklyStats} /> : null}
        </aside>
      </div>
    </div>
  );
}
