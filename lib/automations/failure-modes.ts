import type { FailureMode } from "./wizard-state";

export type RetryConfig = {
  maxAttempts: number;
  notifyOnFailure: boolean;
};

/** Map user-facing failure modes to Phase 1 job retry config. */
export function failureModeToRetryConfig(mode: FailureMode): RetryConfig {
  switch (mode) {
    case "retry_3":
      return { maxAttempts: 3, notifyOnFailure: true };
    case "retry_1":
      return { maxAttempts: 2, notifyOnFailure: true };
    case "notify_only":
      return { maxAttempts: 1, notifyOnFailure: true };
  }
}

export function describeFailureMode(mode: FailureMode): string {
  switch (mode) {
    case "retry_3":
      return "失敗したら最大3回まで再試行し、それでもダメならお知らせします";
    case "retry_1":
      return "失敗したら1回再試行し、ダメならお知らせします";
    case "notify_only":
      return "失敗したら再試行せず、すぐお知らせします";
  }
}
