"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/automation-first/empty-state";
import { ErrorState } from "@/components/automation-first/error-state";
import { PageHeader } from "@/components/automation-first/page-header";
import { Timeline } from "@/components/automation-first/timeline";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import {
  buildTodayJobsFromAutomations,
  formatTodayDateLabel,
  jobsToTimelineItems,
} from "@/lib/automation-first/home-model";
import { fetchAutomations } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations } from "@/lib/compatibility";
import { LoadingState } from "@/components/ui/loading-state";

export function TodayWorkPage() {
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    void fetchAutomations()
      .then((items) => setAutomations(normalizeAutomations(items)))
      .catch((err: Error) => {
        setError(err.message || "読み込めませんでした");
        setAutomations([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const jobs = useMemo(
    () => (automations ? buildTodayJobsFromAutomations(automations) : []),
    [automations],
  );
  const timeline = useMemo(() => jobsToTimelineItems(jobs), [jobs]);

  useEffect(() => {
    if (automations) {
      trackAutomationFirstEvent("home_viewed", {
        source: "today_page",
        count: jobs.length,
      });
    }
  }, [automations, jobs.length]);

  if (automations === null && !error) {
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

      {timeline.length === 0 ? (
        <EmptyState
          title="今日の予定はまだありません"
          description="自動化を作成すると、ここに今日の流れが表示されます。"
          primaryHref="/automations/new"
          primaryLabel="新しい自動化を作る"
          secondaryHref="/workspace"
          secondaryLabel="一度だけお願いする"
          onPrimaryClick={() =>
            trackAutomationFirstEvent("empty_state_cta_clicked", {
              source: "today_empty",
            })
          }
        />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] lg:gap-8">
          <Timeline
            items={timeline}
            onItemOpen={(id) =>
              trackAutomationFirstEvent("run_detail_opened", {
                id,
                source: "today_timeline",
              })
            }
          />
          <aside className="mt-6 space-y-3 lg:mt-0">
            <h2 className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]">
              操作のヒント
            </h2>
            <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--text-secondary)]">
              確認待ちは詳細から承認できます。失敗した仕事は自動化一覧から再実行できます。
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
