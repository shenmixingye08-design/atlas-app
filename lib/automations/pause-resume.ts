import type { Automation, AutomationRunHistoryEntry } from "./types";
import { computeNextRunIso } from "./schedule";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function isTestRun(entry: AutomationRunHistoryEntry): boolean {
  return entry.triggerType === "test";
}

export function filterProductionRuns(
  history: AutomationRunHistoryEntry[],
): AutomationRunHistoryEntry[] {
  return history.filter((e) => !isTestRun(e));
}

export function metricsLast30Days(automation: Automation): {
  completed: number;
  failed: number;
  timeSavedMinutesEstimate: number;
  label: string;
} {
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const runs = filterProductionRuns(automation.runHistory ?? []).filter(
    (e) => new Date(e.completedAt).getTime() >= cutoff,
  );
  const completed = runs.filter((e) => e.status === "completed").length;
  const failed = runs.filter((e) => e.status === "failed").length;
  const minutesPerRun = estimateMinutesPerRun(automation);
  return {
    completed,
    failed,
    timeSavedMinutesEstimate: completed * minutesPerRun,
    label: "推定",
  };
}

/** Rule-based time saved — labeled 推定 in UI. */
function estimateMinutesPerRun(automation: Automation): number {
  const text = `${automation.name} ${automation.workflow.assignment}`.toLowerCase();
  if (/sns|x\(|twitter|投稿/.test(text)) return 20;
  if (/ブログ|記事/.test(text)) return 45;
  if (/営業資料|提案/.test(text)) return 60;
  if (/レポート|報告/.test(text)) return 30;
  return 25;
}

export function describePauseState(enabled: boolean): string {
  return enabled
    ? "有効 — 次の予定どおり実行します"
    : "一時停止 — 予定は止まっています。再開すると次回実行を再計算します";
}

export type PauseResumePatch = {
  enabled: boolean;
  nextRun: string | null;
};

/**
 * Pause/resume without destroying in-flight jobs.
 * On resume, recompute nextRun from now — no catch-up burst.
 */
export function buildPauseResumePatch(
  automation: Automation,
  enabled: boolean,
  now: Date = new Date(),
): PauseResumePatch {
  if (!enabled) {
    return { enabled: false, nextRun: automation.nextRun };
  }
  const nextRun = computeNextRunIso(automation.schedule, now);
  return { enabled: true, nextRun };
}
