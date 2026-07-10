import type { ActivityHistoryFilters, ActivityHistoryItem } from "./types";

function isWithinPeriod(iso: string, period: ActivityHistoryFilters["period"]): boolean {
  if (period === "all") return true;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;

  const now = Date.now();
  const days =
    period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}

export function filterActivityHistoryItems(
  items: ActivityHistoryItem[],
  filters: ActivityHistoryFilters,
): ActivityHistoryItem[] {
  const keyword = filters.keyword.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.favoritesOnly && !item.metadata.favorite) return false;
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (
      filters.employee !== "all" &&
      !item.employees.some((name) => name.includes(filters.employee))
    ) {
      return false;
    }
    if (!isWithinPeriod(item.completedAt, filters.period)) return false;

    if (!keyword) return true;

    const haystack = [
      item.title,
      item.workRequest,
      item.categoryLabel,
      item.employees.join(" "),
      item.services.join(" "),
      item.deliverablePreview ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(keyword);
  });
}

export function collectEmployeeOptions(items: ActivityHistoryItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const employee of item.employees) {
      set.add(employee);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ja"));
}

export const DEFAULT_ACTIVITY_FILTERS: ActivityHistoryFilters = {
  keyword: "",
  category: "all",
  employee: "all",
  period: "all",
  favoritesOnly: false,
};
