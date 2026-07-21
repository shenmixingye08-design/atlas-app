"use client";

import type { WorkCategoryId } from "@/lib/home/monthly-achievements";
import {
  collectEmployeeOptions,
  type ActivityHistoryFilters,
  type ActivityHistoryItem,
} from "@/lib/activity-history";
import { ui } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/design-system/cn";

type ActivityHistoryFiltersBarProps = {
  filters: ActivityHistoryFilters;
  items: ActivityHistoryItem[];
  onChange: (filters: ActivityHistoryFilters) => void;
};

const PERIODS: ActivityHistoryFilters["period"][] = ["all", "7d", "30d", "90d"];
const PERIOD_LABELS: Record<ActivityHistoryFilters["period"], string> = {
  all: ui.activityHistory.periodAll,
  "7d": ui.activityHistory.period7d,
  "30d": ui.activityHistory.period30d,
  "90d": ui.activityHistory.period90d,
};

const CATEGORIES: (WorkCategoryId | "all")[] = [
  "all",
  "sns",
  "blog",
  "sales",
  "email",
  "drive",
  "general",
];

export function ActivityHistoryFiltersBar({
  filters,
  items,
  onChange,
}: ActivityHistoryFiltersBarProps) {
  const employees = collectEmployeeOptions(items);

  return (
    <div className="activity-history-filters space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4 sm:p-5">
      <Input
        value={filters.keyword}
        onChange={(event) =>
          onChange({ ...filters, keyword: event.target.value })
        }
        placeholder={ui.activityHistory.searchPlaceholder}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-2 block text-[var(--text-secondary)]">
            {ui.activityHistory.periodAll}
          </span>
          <select
            value={filters.period}
            onChange={(event) =>
              onChange({
                ...filters,
                period: event.target.value as ActivityHistoryFilters["period"],
              })
            }
            className="minervot-form-control h-11 w-full rounded-[var(--radius-lg)] border border-[var(--form-control-border,var(--border))] bg-[var(--form-control-bg,var(--surface))] px-3 text-sm text-[var(--form-control-text,var(--text-primary))] transition-colors hover:bg-[var(--form-control-hover,var(--secondary-hover))] focus:border-[var(--form-control-focus,var(--border-focus))] focus:outline-none focus:ring-2 focus:ring-[var(--form-control-focus,var(--accent))]/25"
          >
            {PERIODS.map((period) => (
              <option key={period} value={period}>
                {PERIOD_LABELS[period]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-2 block text-[var(--text-secondary)]">
            {ui.activityHistory.categoryAll}
          </span>
          <select
            value={filters.category}
            onChange={(event) =>
              onChange({
                ...filters,
                category: event.target.value as ActivityHistoryFilters["category"],
              })
            }
            className="minervot-form-control h-11 w-full rounded-[var(--radius-lg)] border border-[var(--form-control-border,var(--border))] bg-[var(--form-control-bg,var(--surface))] px-3 text-sm text-[var(--form-control-text,var(--text-primary))] transition-colors hover:bg-[var(--form-control-hover,var(--secondary-hover))] focus:border-[var(--form-control-focus,var(--border-focus))] focus:outline-none focus:ring-2 focus:ring-[var(--form-control-focus,var(--accent))]/25"
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category === "all"
                  ? ui.activityHistory.categoryAll
                  : ui.activityHistory.categories[category]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-2 block text-[var(--text-secondary)]">
            {ui.activityHistory.employeeAll}
          </span>
          <select
            value={filters.employee}
            onChange={(event) =>
              onChange({ ...filters, employee: event.target.value })
            }
            className="minervot-form-control h-11 w-full rounded-[var(--radius-lg)] border border-[var(--form-control-border,var(--border))] bg-[var(--form-control-bg,var(--surface))] px-3 text-sm text-[var(--form-control-text,var(--text-primary))] transition-colors hover:bg-[var(--form-control-hover,var(--secondary-hover))] focus:border-[var(--form-control-focus,var(--border-focus))] focus:outline-none focus:ring-2 focus:ring-[var(--form-control-focus,var(--accent))]/25"
          >
            <option value="all">{ui.activityHistory.employeeAll}</option>
            {employees.map((employee) => (
              <option key={employee} value={employee}>
                {employee}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-h-[44px] items-end gap-2 pb-1 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={filters.favoritesOnly}
            onChange={(event) =>
              onChange({ ...filters, favoritesOnly: event.target.checked })
            }
            className="minervot-form-control h-4 w-4 accent-[var(--form-control-focus,var(--accent))]"
          />
          {ui.activityHistory.favoritesOnly}
        </label>
      </div>
    </div>
  );
}
