import { EXECUTION_TIMEOUT_MS } from "./constants";

export type TimeoutMonitorHandle = {
  /** Clears the watchdog without firing. */
  clear: () => void;
  /** Whether the watchdog already fired. */
  didTimeout: () => boolean;
};

/**
 * Client-side timeout watchdog. Complements server step timeouts without
 * changing the orchestration pipeline.
 */
export function startTimeoutMonitor(
  onTimeout: () => void,
  timeoutMs: number = EXECUTION_TIMEOUT_MS,
): TimeoutMonitorHandle {
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    onTimeout();
  }, timeoutMs);

  return {
    clear: () => {
      clearTimeout(timer);
    },
    didTimeout: () => timedOut,
  };
}

export function formatFailureReason(input: {
  timedOut?: boolean;
  error?: string | null;
  fallback?: string;
}): string {
  if (input.timedOut) {
    return "処理が長時間完了しなかったため、タイムアウトしました。もう一度お試しください。";
  }
  const trimmed = input.error?.trim();
  if (trimmed) return trimmed;
  return input.fallback ?? "実行に失敗しました。内容を確認して再度お試しください。";
}
