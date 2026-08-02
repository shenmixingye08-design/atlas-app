"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";

import { AttentionCard } from "@/components/automation-first/attention-card";
import { EmptyState } from "@/components/automation-first/empty-state";
import { SectionHeader } from "@/components/automation-first/page-header";
import { Timeline } from "@/components/automation-first/timeline";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import {
  buildHomeAttentionItems,
  buildHomeSummary,
  buildTodayJobsFromAutomations,
  formatTodayDateLabel,
  greetingForHour,
  jobsToTimelineItems,
} from "@/lib/automation-first/home-model";
import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";

export type AutomationFirstHomeProps = {
  automations: Automation[];
  projects: Project[];
};

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2">
      <p className="text-[length:var(--text-meta)] text-[var(--text-muted)]">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

export function AutomationFirstHome({
  automations,
  projects: _projects,
}: AutomationFirstHomeProps) {
  const now = useMemo(() => new Date(), []);
  const jobs = useMemo(
    () => buildTodayJobsFromAutomations(automations, now),
    [automations, now],
  );
  const attention = useMemo(
    () => buildHomeAttentionItems(automations),
    [automations],
  );
  const summary = useMemo(
    () => buildHomeSummary(automations, jobs, attention),
    [automations, jobs, attention],
  );
  const timeline = useMemo(() => jobsToTimelineItems(jobs), [jobs]);
  const completedJobs = jobs.filter((j) => j.status === "completed").slice(0, 4);
  const awaitingJobs = jobs.filter((j) => j.status === "awaiting_review");

  useEffect(() => {
    trackAutomationFirstEvent("home_viewed", {
      automations: automations.length,
      active: summary.activeAutomationCount,
      attention: summary.attentionCount,
    });
  }, [automations.length, summary.activeAutomationCount, summary.attentionCount]);

  const hasAutomations = automations.length > 0;
  const createHref = "/automations/new";
  const oneTimeHref = "/workspace";

  return (
    <div className="automation-first-home space-y-8 pb-8 sm:space-y-10">
      <header className="space-y-3">
        <p className="text-[length:var(--text-caption)] font-medium text-[var(--brand)]">
          MINERVOT
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[length:var(--text-page-title)] font-semibold tracking-tight text-[var(--text-primary)]">
              {greetingForHour(now.getHours())}
            </h1>
            <p className="mt-1 text-[length:var(--text-body)] text-[var(--text-secondary)]">
              {formatTodayDateLabel(now)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatChip label="稼働中の自動化" value={summary.activeAutomationCount} />
            <StatChip label="対応が必要" value={summary.attentionCount} />
          </div>
        </div>
      </header>

      <section
        aria-labelledby="af-hero-heading"
        className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-sm)] sm:p-7"
      >
        <p className="text-[length:var(--text-caption)] font-medium text-[var(--text-muted)]">
          今日の仕事
        </p>
        <h2
          id="af-hero-heading"
          className="mt-1 text-[length:var(--text-display)] font-semibold tracking-tight text-[var(--text-primary)]"
        >
          今日、MINERVOTが行う仕事
        </h2>
        <p className="mt-2 max-w-xl text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--text-secondary)]">
          予定・実行中・確認待ち・完了をひと目で把握できます。単発のお願いも残せますが、主役は自動化です。
        </p>

        {hasAutomations ? (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatChip label="予定" value={summary.scheduledCount} />
            <StatChip label="実行中" value={summary.runningCount} />
            <StatChip label="確認待ち" value={summary.awaitingCount} />
            <StatChip label="完了" value={summary.completedCount} />
          </div>
        ) : null}

        {summary.nextJob ? (
          <p className="mt-4 text-[length:var(--text-body)] text-[var(--text-secondary)]">
            次: <span className="font-medium text-[var(--text-primary)]">{summary.nextJob.title}</span>
            {summary.nextJob.scheduledTime ? (
              <span className="text-[var(--text-muted)]">
                {" "}
                · {summary.nextJob.scheduledTime}
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href={createHref}
            onClick={() =>
              trackAutomationFirstEvent("primary_automation_cta_clicked", {
                source: "home_hero",
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
                source: "home_hero",
              })
            }
            className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-medium text-[var(--text-primary)]"
          >
            一度だけお願いする
          </Link>
        </div>
      </section>

      {!hasAutomations ? (
        <EmptyState
          title="まだ自動化がありません"
          description="繰り返す仕事を一度設定すると、MINERVOTが予定どおり進めます。まずはテンプレートから始められます。"
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

      {(attention.length > 0 || awaitingJobs.length > 0) && (
        <section aria-labelledby="af-attention-heading" className="space-y-3">
          <SectionHeader
            title="対応が必要"
            description="確認・入力・失敗の復旧など、あなたが触る必要がある項目です"
          />
          <div className="space-y-3">
            {awaitingJobs.map((job) => (
              <AttentionCard
                key={`await:${job.id}`}
                kind="approval"
                title={job.title}
                description="実行前の確認が必要です"
                href={job.href ?? "/automations"}
                actionLabel="確認する"
                onOpen={() =>
                  trackAutomationFirstEvent("attention_item_opened", {
                    kind: "approval",
                    id: job.id,
                  })
                }
              />
            ))}
            {attention.map((item) => (
              <AttentionCard
                key={item.id}
                kind={item.kind}
                title={item.title}
                description={item.description}
                href={item.href}
                actionLabel={item.actionLabel}
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
      )}

      {timeline.length > 0 ? (
        <section aria-labelledby="af-timeline-heading" className="space-y-3">
          <SectionHeader
            title="今日のタイムライン"
            description="時刻と状態で、今日の流れを追えます"
            action={
              <Link
                href="/today"
                className="text-sm font-medium text-[var(--brand)] underline-offset-2 hover:underline"
              >
                すべて見る
              </Link>
            }
          />
          <Timeline
            items={timeline}
            onItemOpen={(id) =>
              trackAutomationFirstEvent("run_detail_opened", { id, source: "home_timeline" })
            }
          />
        </section>
      ) : null}

      {completedJobs.length > 0 ? (
        <section aria-labelledby="af-completed-heading" className="space-y-3">
          <SectionHeader title="最近完了した仕事" />
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)]">
            {completedJobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--text-primary)]">{job.title}</p>
                  <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {job.scheduleLabel ?? "完了"}
                  </p>
                </div>
                <Link
                  href={job.href ?? "/history"}
                  onClick={() =>
                    trackAutomationFirstEvent("artifact_opened", {
                      id: job.id,
                      source: "home_completed",
                    })
                  }
                  className="shrink-0 text-sm font-medium text-[var(--brand)] underline-offset-2 hover:underline"
                >
                  確認
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasAutomations ? (
        <section aria-labelledby="af-next-heading" className="space-y-3">
          <SectionHeader
            title="次におすすめ"
            description="繰り返しの仕事を増やすと、確認の手間が減ります"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href={createHref}
              onClick={() =>
                trackAutomationFirstEvent("automation_template_selected", {
                  source: "home_recommend",
                })
              }
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 transition-colors hover:border-[var(--brand)]"
            >
              <p className="font-semibold text-[var(--text-primary)]">自動化テンプレート</p>
              <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                週次資料・定期投稿など、よくある仕事から選ぶ
              </p>
            </Link>
            <Link
              href="/settings/memory"
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 transition-colors hover:border-[var(--brand)]"
            >
              <p className="font-semibold text-[var(--text-primary)]">覚えていること</p>
              <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                文体・保存先・承認の好みを確認・編集
              </p>
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
