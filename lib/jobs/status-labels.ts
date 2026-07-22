import type { JobStatus } from "./types";

/** Unified user-facing job status labels — DB `JobStatus` only in code. */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: "実行予定",
  queued: "待機中",
  running: "実行中",
  retrying: "自動復旧中",
  waiting_for_approval: "承認待ち",
  completed: "完了",
  partially_completed: "確認が必要",
  failed: "失敗",
  cancelled: "停止中",
};

export function getJobStatusLabel(status: JobStatus): string {
  return JOB_STATUS_LABELS[status] ?? status;
}

export function isJobTerminal(status: JobStatus): boolean {
  return (
    status === "completed" ||
    status === "partially_completed" ||
    status === "failed" ||
    status === "cancelled"
  );
}

export function isJobActive(status: JobStatus): boolean {
  return (
    status === "running" ||
    status === "retrying" ||
    status === "queued" ||
    status === "waiting_for_approval"
  );
}
