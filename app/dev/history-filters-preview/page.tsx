"use client";

import { notFound } from "next/navigation";
import { useState } from "react";

import { ActivityHistoryCard } from "@/components/activity-history/activity-history-card";
import { ActivityHistoryFiltersBar } from "@/components/activity-history/activity-history-filters";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import type {
  ActivityHistoryFilters,
  ActivityHistoryItem,
} from "@/lib/activity-history";

/**
 * DEV-ONLY preview of deliverables list + collapsible filters.
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
    title: "朝のメール返信案",
    workRequest: "未読メールを要約して返信案を作成",
    category: "email",
    categoryLabel: "メール",
    status: "completed",
    durationMs: 42000,
    employees: ["AI秘書"],
    services: ["Gmail"],
    deliverablePreview: "件名: ご確認のお願い\n\nお世話になっております。…",
    deliverableType: "text",
    result: null,
    error: null,
    metadata: {
      favorite: true,
      memoryLearned: true,
      templateId: null,
    },
  },
  {
    id: "preview-2",
    source: "automation",
    projectId: null,
    automationId: "auto-1",
    completedAt: new Date(Date.now() - 3600_000).toISOString(),
    title: "SNS投稿文（本日分）",
    workRequest: "商品画像からX投稿文を作成",
    category: "sns",
    categoryLabel: "SNS",
    status: "review",
    durationMs: 28000,
    employees: ["AI秘書"],
    services: ["X"],
    deliverablePreview: "今日のポイントは3つです。…",
    deliverableType: "text",
    result: null,
    error: null,
    metadata: {
      favorite: false,
      memoryLearned: false,
      templateId: null,
    },
  },
  {
    id: "preview-3",
    source: "project",
    projectId: "preview-3",
    automationId: null,
    completedAt: new Date(Date.now() - 86_400_000).toISOString(),
    title: "営業資料の要約",
    workRequest: "提案資料PDFを要約",
    category: "sales",
    categoryLabel: "営業資料",
    status: "completed",
    durationMs: 61000,
    employees: ["AI秘書"],
    services: ["Drive"],
    deliverablePreview: "要点: 導入効果・価格・次のアクション",
    deliverableType: "text",
    result: null,
    error: null,
    metadata: {
      favorite: false,
      memoryLearned: true,
      templateId: null,
    },
  },
];

export default function DevHistoryFiltersPreviewPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <AtlasAppShell active="artifacts">
      <div className="activity-history-page space-y-4 pb-6">
        <header className="space-y-1">
          <p className="text-[length:var(--text-label)] font-semibold tracking-[0.1em] text-[var(--brand)]">
            MINERVOT
          </p>
          <h1 className="text-[length:var(--text-page-title)] font-semibold tracking-tight text-foreground">
            成果物
          </h1>
          <p className="text-[length:var(--text-caption)] text-[var(--foreground-muted)]">
            一覧が主役。検索は折りたたみ式（プレビュー）
          </p>
        </header>

        <ActivityHistoryFiltersBar
          filters={filters}
          items={SAMPLE_ITEMS}
          onChange={setFilters}
        />

        <div className="animate-stagger space-y-2.5">
          {SAMPLE_ITEMS.map((item) => (
            <ActivityHistoryCard
              key={item.id}
              item={item}
              variant="static"
              onReuse={() => undefined}
              onShare={() => undefined}
              onDownload={() => undefined}
            />
          ))}
        </div>
      </div>
    </AtlasAppShell>
  );
}
