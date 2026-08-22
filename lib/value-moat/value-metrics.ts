/**
 * Show only counts we can measure. Never invent "○時間節約".
 */

export type ValueMetric = {
  id: "completed" | "auto_runs" | "reused" | "preference_applied";
  label: string;
  count: number;
};

export function buildValueMetrics(input: {
  completedThisMonth?: number | null;
  autoRunsThisMonth?: number | null;
  reusedJobsThisMonth?: number | null;
  preferenceAppliedThisMonth?: number | null;
}): ValueMetric[] {
  const rows: Array<[ValueMetric["id"], string, number | null | undefined]> = [
    ["completed", "今月MINERVOTが完了した仕事", input.completedThisMonth],
    ["auto_runs", "自動実行", input.autoRunsThisMonth],
    ["reused", "再利用した仕事", input.reusedJobsThisMonth],
    ["preference_applied", "前回の好みを反映", input.preferenceAppliedThisMonth],
  ];
  return rows
    .filter(([, , count]) => typeof count === "number" && Number.isFinite(count) && count > 0)
    .map(([id, label, count]) => ({
      id,
      label,
      count: count as number,
    }));
}
