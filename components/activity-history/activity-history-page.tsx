"use client";

import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ActivityHistoryCard } from "@/components/activity-history/activity-history-card";
import { ActivityHistoryDetail } from "@/components/activity-history/activity-history-detail";
import { ActivityHistoryFiltersBar } from "@/components/activity-history/activity-history-filters";
import { IconEmptyWork } from "@/components/ui/icons";
import { LoadingState } from "@/components/ui/loading-state";
import type { ActivityHistoryItem } from "@/lib/activity-history";
import { useActivityHistory } from "@/lib/activity-history/use-activity-history";
import { ui } from "@/lib/i18n";

function downloadDeliverableText(item: ActivityHistoryItem) {
  const body =
    item.deliverablePreview?.trim() ||
    item.workRequest ||
    item.title;
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${item.title || "deliverable"}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function shareDeliverable(item: ActivityHistoryItem) {
  const text =
    item.deliverablePreview?.trim() ||
    item.workRequest ||
    item.title;
  try {
    if (navigator.share) {
      await navigator.share({ title: item.title, text });
      return;
    }
  } catch {
    // fall through to clipboard
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore — UI-only convenience
  }
}

export function ActivityHistoryPageContent() {
  const router = useRouter();
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
    return scheduleMountWork(() => {
      const itemId = searchParams.get("item");
      if (!itemId || !isReady) return;
      if (items.some((entry) => entry.id === itemId)) {
        setSelectedId(itemId);
        setDeepLinkMiss(null);
      } else {
        setDeepLinkMiss(itemId);
      }
    });
  }, [searchParams, items, isReady]);

  const deepLinkProjectId = deepLinkMiss?.startsWith("project-")
    ? deepLinkMiss.slice("project-".length)
    : null;

  return (
    <div className="activity-history-page space-y-4 pb-6">
      <header className="space-y-1">
        <p className="text-[length:var(--text-label)] font-semibold tracking-[0.1em] text-[var(--brand)]">
          {ui.brand}
        </p>
        <h1 className="text-[length:var(--text-page-title)] font-semibold tracking-tight text-foreground sm:text-display">
          成果物
        </h1>
        <p className="text-[length:var(--text-caption)] text-[var(--foreground-muted)] sm:text-body">
          AI秘書が仕上げた仕事の一覧です。検索より先に、完成物を確認できます。
        </p>
      </header>

      {isReady && deepLinkMiss ? (
        <div className="animate-card-enter rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            ご指定の結果はこの端末の履歴に見つかりませんでした。
          </p>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            別の端末で実行された可能性があります。保存済みの結果を直接開きます。
          </p>
          {deepLinkProjectId ? (
            <Link
              href={`/projects/${encodeURIComponent(deepLinkProjectId)}`}
              className="mt-2 inline-block text-[var(--accent)] hover:underline"
            >
              結果を開く →
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Compact collapsible search — list remains the hero */}
      <ActivityHistoryFiltersBar
        filters={filters}
        items={items}
        onChange={setFilters}
      />

      {!isReady ? (
        <LoadingState message={ui.activityHistory.loading} />
      ) : filteredItems.length === 0 ? (
        <div className="animate-card-enter rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] bg-[linear-gradient(180deg,var(--surface-elevated),var(--surface-muted))] px-5 py-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-muted)] text-[var(--brand)]">
            <IconEmptyWork className="h-7 w-7" />
          </div>
          <p className="mt-4 text-lg font-medium text-foreground">
            {ui.activityHistory.empty}
          </p>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            {ui.activityHistory.emptyHint}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
            おすすめの最初の仕事：X投稿を自動化する。
          </p>
          <Link href="/workspace" className="btn-brand mt-5 inline-flex">
            {ui.nav.work}
          </Link>
        </div>
      ) : (
        <div className="activity-history-timeline animate-stagger relative space-y-2.5 pl-0 sm:pl-5">
          <div
            aria-hidden
            className="absolute bottom-0 left-1.5 top-0 hidden w-px bg-[var(--border-subtle)] sm:block"
          />
          {filteredItems.map((item) => (
            <div key={item.id} className="relative">
              <span
                aria-hidden
                className="absolute -left-[1.15rem] top-5 hidden h-2 w-2 rounded-full bg-[var(--accent)] sm:block"
              />
              <ActivityHistoryCard
                item={item}
                selected={selectedId === item.id}
                onSelect={(next: ActivityHistoryItem) => setSelectedId(next.id)}
                onReuse={(next) => {
                  router.push(
                    `/workspace?assignment=${encodeURIComponent(next.workRequest)}`,
                  );
                }}
                onShare={(next) => {
                  void shareDeliverable(next);
                }}
                onDownload={(next) => {
                  downloadDeliverableText(next);
                }}
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
