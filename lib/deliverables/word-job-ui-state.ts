/**
 * Mobile-facing Word job UI states — inbox/results must not reuse these strings
 * for "no notifications" or "no deliverable" empties.
 */

export const WORD_JOB_UI_PHASES = [
  "accepted",
  "processing",
  "completed",
  "failed",
  "timed_out",
  "network_error",
] as const;

export type WordJobUiPhase = (typeof WORD_JOB_UI_PHASES)[number];

export type WordJobUiCopy = {
  title: string;
  description: string | null;
  primaryAction: string | null;
  secondaryAction: string | null;
};

export const WORD_JOB_UI_COPY: Record<WordJobUiPhase, WordJobUiCopy> = {
  accepted: {
    title: "Word作成を受け付けました。",
    description: null,
    primaryAction: null,
    secondaryAction: null,
  },
  processing: {
    title: "Wordを作成しています。",
    description: "完了すると通知でお知らせします。",
    primaryAction: null,
    secondaryAction: null,
  },
  completed: {
    title: "Wordが完成しました。",
    description: null,
    primaryAction: "Wordを開く",
    secondaryAction: "ダウンロード",
  },
  failed: {
    title: "Wordの作成に失敗しました。",
    description: null,
    primaryAction: "もう一度試す",
    secondaryAction: "詳細を見る",
  },
  timed_out: {
    title: "処理時間を超えたため停止しました。",
    description: null,
    primaryAction: "もう一度試す",
    secondaryAction: null,
  },
  network_error: {
    title: "最新状態を取得できませんでした。",
    description: null,
    primaryAction: "再読み込み",
    secondaryAction: null,
  },
};

/** Map canonical work-job API status → mobile Word UI phase. */
export function mapWorkJobStatusToWordUiPhase(input: {
  status: string | null | undefined;
  blockReason?: string | null;
  networkError?: boolean;
}): WordJobUiPhase | null {
  if (input.networkError) return "network_error";
  const status = (input.status ?? "").toLowerCase();
  if (!status) return null;
  if (status === "queued") return "accepted";
  if (status === "processing" || status === "running") {
    if (input.blockReason === "awaiting_confirmation") return null;
    return "processing";
  }
  if (status === "completed" || status === "complete") return "completed";
  if (status === "timed_out" || status === "timeout") return "timed_out";
  if (status === "failed" || status === "error" || status === "cancelled") {
    return "failed";
  }
  return null;
}

export const WORD_JOB_SESSION_KEY = "atlas_active_word_job_v1";

export type WordJobSessionSnapshot = {
  jobId: string;
  assignment: string;
  phase: WordJobUiPhase;
  updatedAt: string;
  errorDetail?: string | null;
};

export function readWordJobSession(): WordJobSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(WORD_JOB_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WordJobSessionSnapshot;
    if (!parsed?.jobId || !parsed?.phase) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeWordJobSession(snapshot: WordJobSessionSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      WORD_JOB_SESSION_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    // Ignore quota / private mode.
  }
}

export function clearWordJobSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(WORD_JOB_SESSION_KEY);
  } catch {
    // ignore
  }
}

/** User-safe failure detail — strip stacks / internal codes. */
export function sanitizeWordFailureDetail(
  reason: string | null | undefined,
): string | null {
  const trimmed = reason?.trim();
  if (!trimmed) return "もう一度お試しいただくか、詳細をご確認ください。";
  if (/stack|ECONN|supabase|openai|internal|at\s+\//i.test(trimmed)) {
    return "もう一度お試しいただくか、詳細をご確認ください。";
  }
  return trimmed.slice(0, 200);
}
