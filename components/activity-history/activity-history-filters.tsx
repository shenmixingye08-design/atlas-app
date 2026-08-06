"use client";

import { useState } from "react";

import type { WorkCategoryId } from "@/lib/home/monthly-achievements";
import {
  collectEmployeeOptions,
  type ActivityHistoryFilters,
  type ActivityHistoryItem,
} from "@/lib/activity-history";
import { ui } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { IconChevron, IconSearch } from "@/components/ui/icons";
import { cn } from "@/lib/design-system/cn";

type ActivityHistoryFiltersBarProps = {
  filters: ActivityHistoryFilters;
  items: ActivityHistoryItem[];
  onChange: (filters: ActivityHistoryFilters) => void;
  /** Compact: collapsed by default so the list leads. */
  defaultOpen?: boolean;
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

function hasActiveFilters(filters: ActivityHistoryFilters): boolean {
  return (
    filters.keyword.trim().length > 0 ||
    filters.period !== "all" ||
    filters.category !== "all" ||
    filters.employee !== "all" ||
    filters.favoritesOnly
  );
}

export function ActivityHistoryFiltersBar({
  filters,
  items,
  onChange,
  defaultOpen = false,
}: ActivityHistoryFiltersBarProps) {
  const employees = collectEmployeeOptions(items);
  const active = hasActiveFilters(filters);
  const [open, setOpen] = useState(defaultOpen || active);

  return (
    <div className="activity-history-filters rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-h-[44px] items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--secondary-hover)]"
        aria-expanded={open}
      >
        <IconSearch className="h-4 w-4 text-[var(--text-muted)]" />
        <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
          検索・絞り込み
        </span>
        {active ? (
          <span className="rounded-full bg-[var(--brand-muted)] px-2 py-0.5 text-[length:var(--text-meta)] font-medium text-[var(--brand)]">
            適用中
          </span>
        ) : null}
        <IconChevron
          className={cn(
            "h-4 w-4 text-[var(--text-muted)] transition-transform duration-[var(--motion-fast)]",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="animate-fade-in space-y-3 border-t border-[var(--border-subtle)] px-3.5 py-3">
          <Input
            value={filters.keyword}
            onChange={(event) =>
              onChange({ ...filters, keyword: event.target.value })
            }
            placeholder={ui.activityHistory.searchPlaceholder}
          />

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[length:var(--text-meta)] text-[var(--text-secondary)]">
                {ui.activityHistory.periodAll}
              </span>
              <select
                value={filters.period}
                onChange={(event) =>
                  onChange({
                    ...filters,
                    period: event.target
                      .value as ActivityHistoryFilters["period"],
                  })
                }
                className="minervot-form-control h-10 w-full rounded-[var(--radius-md)] border border-[var(--form-control-border,var(--border))] bg-[var(--form-control-bg,var(--surface))] px-3 text-sm text-[var(--form-control-text,var(--text-primary))] transition-colors hover:bg-[var(--form-control-hover,var(--secondary-hover))] focus:border-[var(--form-control-focus,var(--border-focus))] focus:outline-none focus:ring-2 focus:ring-[var(--form-control-focus,var(--accent))]/25"
              >
                {PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {PERIOD_LABELS[period]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-[length:var(--text-meta)] text-[var(--text-secondary)]">
                {ui.activityHistory.categoryAll}
              </span>
              <select
                value={filters.category}
                onChange={(event) =>
                  onChange({
                    ...filters,
                    category: event.target
                      .value as ActivityHistoryFilters["category"],
                  })
                }
                className="minervot-form-control h-10 w-full rounded-[var(--radius-md)] border border-[var(--form-control-border,var(--border))] bg-[var(--form-control-bg,var(--surface))] px-3 text-sm text-[var(--form-control-text,var(--text-primary))] transition-colors hover:bg-[var(--form-control-hover,var(--secondary-hover))] focus:border-[var(--form-control-focus,var(--border-focus))] focus:outline-none focus:ring-2 focus:ring-[var(--form-control-focus,var(--accent))]/25"
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
              <span className="mb-1.5 block text-[length:var(--text-meta)] text-[var(--text-secondary)]">
                {ui.activityHistory.employeeAll}
              </span>
              <select
                value={filters.employee}
                onChange={(event) =>
                  onChange({ ...filters, employee: event.target.value })
                }
                className="minervot-form-control h-10 w-full rounded-[var(--radius-md)] border border-[var(--form-control-border,var(--border))] bg-[var(--form-control-bg,var(--surface))] px-3 text-sm text-[var(--form-control-text,var(--text-primary))] transition-colors hover:bg-[var(--form-control-hover,var(--secondary-hover))] focus:border-[var(--form-control-focus,var(--border-focus))] focus:outline-none focus:ring-2 focus:ring-[var(--form-control-focus,var(--accent))]/25"
              >
                <option value="all">{ui.activityHistory.employeeAll}</option>
                {employees.map((employee) => (
                  <option key={employee} value={employee}>
                    {employee}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-[40px] items-end gap-2 pb-1 text-sm text-[var(--text-secondary)]">
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
      ) : null}
    </div>
  );
}
