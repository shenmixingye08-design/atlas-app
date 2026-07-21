"use client";

import { notFound } from "next/navigation";

import { ActivityHistoryFiltersBar } from "@/components/activity-history/activity-history-filters";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import type { ActivityHistoryFilters, ActivityHistoryItem } from "@/lib/activity-history";

/**
 * DEV-ONLY preview of history filters in light-warm theme.
 * Returns 404 in production.
 */
export const dynamic = "force-static";

const DEFAULT_FILTERS: ActivityHistoryFilters = {
  keyword: "",
  period: "all",
  category: "all",
  employee: "all",
  favoritesOnly: false,
};

const SAMPLE_ITEMS: ActivityHistoryItem[] = [
  {
    id: "preview-1",
    source: "project",
    projectId: "preview-1",
    automationId: null,
    completedAt: new Date().toISOString(),
    title: "サンプル実行",
    workRequest: "テスト依頼",
    category: "general",
    categoryLabel: "一般",
    status: "completed",
    durationMs: 1200,
    employees: ["秘書A"],
    services: [],
    deliverablePreview: null,
    deliverableType: null,
    result: null,
    error: null,
    metadata: {},
  },
];

export default function DevHistoryFiltersPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <AtlasAppShell active="history">
      <div className="activity-history-page space-y-6 pb-8">
        <header className="space-y-2">
          <h1 className="text-display text-foreground">AI実行履歴（フィルタプレビュー）</h1>
          <p className="text-body text-[var(--foreground-muted)]">
            ライト（赤ゴールド）テーマでの検索・セレクト・チェックボックスの可読性確認用
          </p>
        </header>
        <ActivityHistoryFiltersBar
          filters={DEFAULT_FILTERS}
          items={SAMPLE_ITEMS}
          onChange={() => undefined}
        />
      </div>
    </AtlasAppShell>
  );
}
