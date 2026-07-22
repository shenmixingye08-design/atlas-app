import type { Automation } from "./types";

/** Paused automations must not show next_run in UI and must not enqueue new jobs. */
export function shouldShowNextRun(automation: Automation): boolean {
  return automation.enabled && Boolean(automation.nextRun);
}

export function formatNextRunDisplay(
  automation: Automation,
  formatDateTime: (iso: string | null) => string,
): string {
  if (!shouldShowNextRun(automation)) return "—";
  return formatDateTime(automation.nextRun);
}

export function pauseReconnectMessage(enabled: boolean): string | null {
  if (enabled) return null;
  return "停止中です。連携の再接続が必要な場合は設定から確認してください。";
}
