"use client";

import type {
  AutomationListFilter,
  AutomationListSort,
} from "@/lib/automation-platform/operations/list-model";

export type { AutomationListFilter, AutomationListSort };

const FILTER_OPTIONS: Array<{ id: AutomationListFilter; label: string }> = [
  { id: "all", label: "すべて" },
  { id: "active", label: "有効" },
  { id: "paused", label: "一時停止" },
  { id: "awaiting_approval", label: "確認待ち" },
  { id: "needs_input", label: "確認待ち" },
  { id: "has_failure", label: "失敗あり" },
  { id: "runs_today", label: "今日実行" },
  { id: "runs_this_week", label: "今週実行" },
  { id: "archived", label: "削除済み" },
];

const SORT_OPTIONS: Array<{ id: AutomationListSort; label: string }> = [
  { id: "next_run", label: "次回実行順" },
  { id: "updated", label: "更新順" },
  { id: "success_rate", label: "成功率" },
  { id: "name", label: "名前" },
  { id: "last_run", label: "最終実行順" },
];

export function AutomationListControls({
  filter,
  sort,
  query,
  onFilterChange,
  onSortChange,
  onQueryChange,
}: {
  filter: AutomationListFilter;
  sort: AutomationListSort;
  query: string;
  onFilterChange: (value: AutomationListFilter) => void;
  onSortChange: (value: AutomationListSort) => void;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">自動化を検索</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="名前・目的・手順で検索"
          className="min-h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm"
        />
      </label>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onFilterChange(option.id)}
            className={
              filter === option.id
                ? "min-h-10 shrink-0 rounded-full bg-accent px-3 text-sm text-white"
                : "min-h-10 shrink-0 rounded-full bg-[var(--surface-muted)] px-3 text-sm"
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-[var(--muted)]">並び替え</span>
        <select
          value={sort}
          onChange={(event) =>
            onSortChange(event.target.value as AutomationListSort)
          }
          className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
