import type {
  XAutoPostRun,
  XAutoPostSettings,
  XAutoPostStatusResult,
} from "./autopost-types";

export type {
  XAutoPostMemoryView,
  XAutoPostQuotaView,
  XAutoPostRun,
  XAutoPostSettings,
  XAutoPostStatusResult,
} from "./autopost-types";

export {
  X_AUTOPOST_PURPOSE_PRESETS,
  X_AUTOPOST_AUDIENCE_PRESETS,
  X_AUTOPOST_TONE_PRESETS,
  X_AUTOPOST_FREQUENCY_OPTIONS,
  X_AUTOPOST_WEEKDAY_LABELS,
  X_AUTOPOST_TYPE_LABELS,
  formatXAutoPostMode,
  formatXAutoPostFrequency,
} from "./autopost-types";

/** What the settings form sends when saving. */
export type XAutoPostSettingsInput = Partial<
  Pick<
    XAutoPostSettings,
    | "enabled"
    | "mode"
    | "purpose"
    | "themes"
    | "audience"
    | "tone"
    | "frequency"
    | "daysOfWeek"
    | "postTimes"
    | "timezone"
    | "includeHashtags"
  >
>;

export async function fetchXAutoPostStatusClient(): Promise<XAutoPostStatusResult> {
  const response = await fetch("/api/x/autopost", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as
    | XAutoPostStatusResult
    | { message?: string }
    | null;

  if (!response.ok) {
    if (body && "status" in body && body.status === "feature_disabled") {
      return body as XAutoPostStatusResult;
    }
    throw new Error(
      (body && "message" in body && body.message) ||
        "自動投稿の設定を取得できませんでした",
    );
  }

  if (body && "status" in body && body.status === "ready") {
    return {
      ...body,
      connectionStatus: body.connectionStatus ?? (body.connected ? "connected" : "disconnected"),
      postedThisMonth: body.postedThisMonth ?? 0,
      quota: body.quota ?? null,
      memory: body.memory ?? { applied: false, labels: [], memoryFailed: false },
    };
  }

  return body as XAutoPostStatusResult;
}

export async function saveXAutoPostSettingsClient(
  input: XAutoPostSettingsInput,
): Promise<{ settings: XAutoPostSettings; nextScheduledFor: string | null }> {
  const response = await fetch("/api/x/autopost", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => null)) as
    | { settings: XAutoPostSettings; nextScheduledFor: string | null }
    | { message?: string }
    | null;

  if (!response.ok || !body || !("settings" in body)) {
    throw new Error(
      (body && "message" in body && body.message) ||
        "自動投稿の設定を保存できませんでした",
    );
  }

  return body;
}

export function formatXAutoPostDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function runXAutoPostTrialClient(input: {
  confirm: boolean;
  overrideText?: string;
}): Promise<{
  status: "posted" | "drafted" | "failed" | "skipped" | "error";
  text?: string;
  message?: string;
  reason?: string;
  memoryApplied?: boolean;
  memoryFailed?: boolean;
  alreadyDone?: boolean;
  nextScheduledFor?: string | null;
}> {
  const response = await fetch("/api/x/autopost/trial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as {
    status?: string;
    text?: string;
    message?: string;
    reason?: string;
    memoryApplied?: boolean;
    memoryFailed?: boolean;
    alreadyDone?: boolean;
    nextScheduledFor?: string | null;
  } | null;

  if (!response.ok || !body) {
    return {
      status: body?.status === "skipped" ? "skipped" : "failed",
      message:
        body?.message ??
        (response.status === 403
          ? "今月の利用上限に達しました"
          : "実行に失敗しました"),
      reason: body?.reason,
      memoryApplied: body?.memoryApplied === true,
      memoryFailed: body?.memoryFailed === true,
      nextScheduledFor: body?.nextScheduledFor ?? null,
    };
  }

  return {
    status:
      body.status === "posted" || body.status === "drafted"
        ? body.status
        : "failed",
    text: body.text,
    message: body.message,
    reason: body.reason,
    memoryApplied: body.memoryApplied === true,
    memoryFailed: body.memoryFailed === true,
    alreadyDone: body.alreadyDone === true,
    nextScheduledFor: body.nextScheduledFor ?? null,
  };
}

export function formatXAutoPostRunStatus(run: XAutoPostRun): string {
  switch (run.status) {
    case "posted":
      return "投稿済み";
    case "drafted":
      return "下書き作成";
    case "failed":
      return "失敗";
    case "skipped":
      return "スキップ";
    case "processing":
      return "処理中";
    default:
      return run.status;
  }
}
