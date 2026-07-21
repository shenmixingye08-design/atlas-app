"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ActivityHistoryCard } from "@/components/activity-history/activity-history-card";
import { ActivityHistoryDetail } from "@/components/activity-history/activity-history-detail";
import { ActivityHistoryFiltersBar } from "@/components/activity-history/activity-history-filters";
import { LoadingState } from "@/components/ui/loading-state";
import type { ActivityHistoryItem } from "@/lib/activity-history";
import { useActivityHistory } from "@/lib/activity-history/use-activity-history";
import { ui } from "@/lib/i18n";

export function ActivityHistoryPageContent() {
  const {
    filteredItems,
    filters,
    setFilters,
    items,
    isReady,
    reload,
    getItem,
  } = useActivityHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deepLinkMiss, setDeepLinkMiss] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const selected = selectedId ? getItem(selectedId) : null;

  useEffect(() => {
    const itemId = searchParams.get("item");
    if (!itemId || !isReady) return;
    if (items.some((entry) => entry.id === itemId)) {
      setSelectedId(itemId);
      setDeepLinkMiss(null);
    } else {
      // The requested result is not in this browser's local list (other device
      // / cold start / server-triggered run). Never fail silently — surface a
      // link to the durable /projects/<id> page, which loads it from the server.
      setDeepLinkMiss(itemId);
    }
  }, [searchParams, items, isReady]);

  // Map an activity-history item id (`project-<projectId>`) to the durable
  // project id used by the /projects/<id> deep-link page.
  const deepLinkProjectId = deepLinkMiss?.startsWith("project-")
    ? deepLinkMiss.slice("project-".length)
    : null;

  return (
    <div className="activity-history-page space-y-6 pb-8">
      <header className="space-y-2">
        <p className="text-caption">{ui.brand}</p>
        <h1 className="text-display text-foreground">{ui.activityHistory.pageTitle}</h1>
        <p className="text-body max-w-2xl text-[var(--foreground-muted)]">
          {ui.activityHistory.pageSubtitle}
        </p>
      </header>

      {isReady && deepLinkMiss ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-4">
          <p className="text-sm font-medium text-foreground">
            ご指定の結果はこの端末の履歴に見つかりませんでした。
          </p>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            別の端末で実行された可能性があります。保存済みの結果を直接開きます。
          </p>
          {deepLinkProjectId ? (
            <Link
              href={`/projects/${encodeURIComponent(deepLinkProjectId)}`}
              className="mt-3 inline-block text-[var(--accent)] hover:underline"
            >
              結果を開く →
            </Link>
          ) : null}
        </div>
      ) : null}

      <ActivityHistoryFiltersBar
        filters={filters}
        items={items}
        onChange={setFilters}
      />

      {!isReady ? (
        <LoadingState message={ui.activityHistory.loading} />
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-6 py-12 text-center">
          <p className="text-lg font-medium text-foreground">{ui.activityHistory.empty}</p>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            {ui.activityHistory.emptyHint}
          </p>
          <Link href="/workspace" className="mt-6 inline-block text-[var(--accent)] hover:underline">
            {ui.nav.work}
          </Link>
        </div>
      ) : (
        <div className="activity-history-timeline relative space-y-4 pl-0 sm:pl-6">
          <div
            aria-hidden
            className="absolute bottom-0 left-2 top-0 hidden w-px bg-[var(--border-subtle)] sm:block"
          />
          {filteredItems.map((item) => (
            <div key={item.id} className="relative">
              <span
                aria-hidden
                className="absolute -left-[1.35rem] top-6 hidden h-2.5 w-2.5 rounded-full bg-[var(--accent)] sm:block"
              />
              <ActivityHistoryCard
                item={item}
                selected={selectedId === item.id}
                onSelect={(next: ActivityHistoryItem) => setSelectedId(next.id)}
              />
            </div>
          ))}
        </div>
      )}

      {selected ? (
        <ActivityHistoryDetail
          item={selected}
          onClose={() => setSelectedId(null)}
          onUpdated={() => {
            reload();
            setSelectedId(null);
          }}
        />
      ) : null}
    </div>
  );
}
