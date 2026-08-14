/**
 * User-facing Automation copy. No new engine — labels over existing SoT.
 * Never show cron / nextRunAt / destination / worker / JSON to customers.
 */

import { describeAppliedPreferenceLabels } from "@/lib/automations/display";
import { readAutomationMemorySnapshot } from "@/lib/memory-apply/automation-memory-snapshot";
import { describeXSocialPreference } from "@/lib/memory-apply/x-social-preference";
import {
  addDays,
  DEFAULT_AUTOMATION_TIMEZONE,
  getZonedParts,
} from "@/lib/automations/schedule";
import type {
  Automation,
  AutomationExecutionLevel,
  AutomationRunHistoryEntry,
} from "@/lib/automations/types";

export const AUTOMATION_FIRST_EXAMPLE = "毎朝8時にX投稿して";

export const AUTOMATION_UX_JARGON_RE =
  /occurrence|scheduler|worker|cron|nextRunAt|destination|approval_pending|runId|jobId|occurrenceId|diagnosticId|Minute Scheduler|full_auto|approve_then_run/i;

export type AutomationUserStatus =
  | "running_ok"
  | "paused"
  | "waiting"
  | "awaiting_approval"
  | "retrying"
  | "needs_attention"
  | "failed";

export const AUTOMATION_USER_STATUS_LABEL: Record<AutomationUserStatus, string> = {
  running_ok: "稼働中",
  paused: "一時停止",
  waiting: "実行待ち",
  awaiting_approval: "承認待ち",
  retrying: "再試行中",
  needs_attention: "要確認",
  failed: "失敗",
};

export function describeAutomationAction(automation: Pick<Automation, "destination" | "workflow" | "name">): string {
  if (automation.destination === "x") return "Xへ投稿";
  const assignment = automation.workflow.assignment.trim();
  if (/カレンダー/.test(assignment)) return "カレンダーに登録";
  if (/ブログ|WordPress/.test(assignment)) return "ブログを作成";
  if (assignment) {
    return assignment.length > 24 ? `${assignment.slice(0, 24)}…` : assignment;
  }
  return automation.name;
}

export function describeApprovalMethod(
  level: AutomationExecutionLevel,
): { label: string; hint: string } {
  if (level === "full_auto") {
    return { label: "自動で実行", hint: "予定の時刻に、確認なしで実行します" };
  }
  if (level === "draft_save") {
    return { label: "下書きだけ作る", hint: "文章だけ用意し、自動では送りません" };
  }
  if (level === "suggest_only") {
    return { label: "作成前に確認", hint: "内容を作る前に方針を確認します" };
  }
  return { label: "実行前に確認", hint: "実行する前に、内容を確認します" };
}

export function resolveAutomationUserStatus(
  automation: Automation,
): AutomationUserStatus {
  if (!automation.enabled) return "paused";
  if (automation.status === "running") return "waiting";
  if (automation.status === "failed") return "failed";
  const last = automation.runHistory?.[0];
  if (last?.status === "awaiting_approval") return "awaiting_approval";
  if (last?.status === "failed" && (last.retryCount ?? 0) > 0) return "retrying";
  if (last?.status === "failed") return "needs_attention";
  if (!automation.nextRun) return "waiting";
  return "running_ok";
}

export function formatUserNextRun(input: {
  nextRun: string | null | undefined;
  enabled: boolean;
  status?: AutomationUserStatus;
  now?: Date;
  timeZone?: string;
}): string {
  if (!input.enabled || input.status === "paused") return "一時停止中";
  if (input.status === "awaiting_approval") return "承認待ち";
  if (input.status === "failed" || input.status === "needs_attention") {
    return "要確認";
  }
  if (!input.nextRun) return "実行待ち";
  return formatUserDateTime(input.nextRun, {
    now: input.now,
    timeZone: input.timeZone,
  });
}

/** Calendar date/time for Japan users. Never returns a raw UTC ISO string. */
export function formatUserDateTime(
  iso: string | null | undefined,
  options?: { now?: Date; timeZone?: string },
): string {
  if (!iso) return "実行待ち";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "実行待ち";
  if (/[A-Z]{3}|UTC/.test(iso) && !iso.includes("T")) {
    return "実行待ち";
  }
  const timeZone = options?.timeZone ?? DEFAULT_AUTOMATION_TIMEZONE;
  const now = options?.now ?? new Date();
  const target = getZonedParts(date, timeZone);
  const today = getZonedParts(now, timeZone);
  const tomorrow = addDays(today.year, today.month, today.day, 1);
  const time = `${String(target.hour).padStart(2, "0")}:${String(target.minute).padStart(2, "0")}`;
  const sameDay =
    target.year === today.year &&
    target.month === today.month &&
    target.day === today.day;
  if (sameDay) return `今日 ${time}`;
  const isTomorrow =
    target.year === tomorrow.year &&
    target.month === tomorrow.month &&
    target.day === tomorrow.day;
  if (isTomorrow) return `明日 ${time}`;
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][target.dayOfWeek] ?? "";
  return `${target.month}月${target.day}日（${weekday}） ${time}`;
}

export function describeScheduleFrequency(automation: Automation): string {
  const schedule = automation.schedule;
  if (schedule.kind !== "schedule") return "順次対応";
  const label = schedule.label?.trim();
  if (label && !/cron|UTC|nextRun/i.test(label)) return label;
  const preset = schedule.preset;
  const time = `${String(preset.hour).padStart(2, "0")}:${String(preset.minute).padStart(2, "0")}`;
  if (preset.type === "daily") {
    if (preset.weekdays?.length === 5) return `平日 ${time}`;
    return `毎日 ${time}`;
  }
  if (preset.type === "weekly") {
    const day = ["日", "月", "火", "水", "木", "金", "土"][preset.dayOfWeek] ?? "";
    return `毎週${day}曜日 ${time}`;
  }
  return `毎月${preset.dayOfMonth}日 ${time}`;
}

export function describeOverrideLabels(automation: Automation): string[] {
  const snapshot = readAutomationMemorySnapshot(automation.workflow.metadata);
  const overridden = snapshot?.overriddenPreferences;
  if (!overridden) return [];
  return describeXSocialPreference({
    tone: overridden.tone ?? null,
    length: overridden.length ?? null,
    emoji: overridden.emoji ?? null,
    hashtags: overridden.hashtags ?? null,
    hashtagsMax: overridden.hashtagsMax ?? null,
    lineBreaks: overridden.lineBreaks ?? null,
    promotional: overridden.promotional ?? null,
    cta: overridden.cta ?? null,
    theme: overridden.theme ?? null,
    postingHour: overridden.postingHour ?? null,
    approval: overridden.approval ?? null,
  }).map((label) => `この自動化では${label}`);
}

export type AutomationFailureView = {
  title: string;
  body: string;
};

export function explainAutomationFailure(
  error: string | null | undefined,
  errorCode?: string | null,
): AutomationFailureView {
  const text = `${errorCode ?? ""} ${error ?? ""}`;
  if (
    /x_not_connected|x_reconnect|x_missing_|x_token|x_refresh|x_auth|未連携|接続/.test(
      text,
    )
  ) {
    return {
      title: "X接続切れ",
      body: "Xとの接続が切れています。再接続すると自動投稿を再開できます。",
    };
  }
  if (/x_permission|権限|tweet\.write/.test(text)) {
    return {
      title: "権限不足",
      body: "Xへの投稿権限がありません。X連携を確認してください。",
    };
  }
  if (/x_rate_limited|一時|timeout|429|5\d\d|再試行/.test(text)) {
    return {
      title: "一時障害",
      body: "一時的な問題で実行できませんでした。自動で再試行します。",
    };
  }
  if (error?.trim() && !AUTOMATION_UX_JARGON_RE.test(error)) {
    return { title: "実行に失敗しました", body: error.trim().slice(0, 160) };
  }
  return {
    title: "実行に失敗しました",
    body: "実行できませんでした。内容をご確認ください。",
  };
}

export type AutomationPreview = {
  name: string;
  action: string;
  frequency: string;
  nextRunLabel: string;
  memoryLabels: string[];
  overrideLabels: string[];
  approvalLabel: string;
  statusLabel: string;
};

export function buildAutomationPreview(automation: Automation): AutomationPreview {
  const status = resolveAutomationUserStatus(automation);
  return {
    name: automation.name,
    action: describeAutomationAction(automation),
    frequency: describeScheduleFrequency(automation),
    nextRunLabel: formatUserNextRun({
      nextRun: automation.nextRun,
      enabled: automation.enabled,
      status,
    }),
    memoryLabels: describeAppliedPreferenceLabels(automation),
    overrideLabels: describeOverrideLabels(automation),
    approvalLabel: describeApprovalMethod(automation.executionLevel).label,
    statusLabel: AUTOMATION_USER_STATUS_LABEL[status],
  };
}

export function formatAutomationPreviewLines(preview: AutomationPreview): string[] {
  const lines = [
    `内容：${preview.action}`,
    `繰り返し：${preview.frequency}`,
    `次回：${preview.nextRunLabel}`,
    `実行方法：${preview.approvalLabel}`,
  ];
  if (preview.memoryLabels.length > 0) {
    lines.push(`あなたの好みを反映：${preview.memoryLabels.join("、")}`);
  }
  if (preview.overrideLabels.length > 0) {
    lines.push(preview.overrideLabels.join("、"));
  }
  return lines;
}

export function formatRegistrationSuccess(automation: Automation): string {
  const preview = buildAutomationPreview(automation);
  const lines = [
    "自動化しました",
    `${preview.frequency}に${preview.action}します。`,
    `次回：${preview.nextRunLabel}`,
    `実行方法：${preview.approvalLabel}`,
  ];
  if (preview.memoryLabels.length > 0) {
    lines.push(`あなたの好みを反映：${preview.memoryLabels.join("、")}`);
  }
  if (preview.overrideLabels.length > 0) {
    lines.push(preview.overrideLabels.join("、"));
  }
  return lines.join("\n");
}

export function formatFirstSuccessCopy(automation: Automation): string | null {
  if ((automation.successCount ?? 0) !== 1) return null;
  if (automation.status !== "success") return null;
  const action = describeAutomationAction(automation);
  return `自動化が1件完了しました。自分で操作せずに${action}が完了しました。`;
}

export function formatDeleteConfirm(automation: Automation): string {
  const preview = buildAutomationPreview(automation);
  return `「${preview.name}」（${preview.frequency}）を削除します。一覧から消え、今後は動きません。止めるだけなら一時停止を選んでください。`;
}

export function formatHistoryStatus(
  entry: AutomationRunHistoryEntry,
): { label: string; detail: string } {
  if (entry.status === "completed") {
    return { label: "成功", detail: entry.generatedText?.slice(0, 80) ?? "完了しました" };
  }
  if (entry.status === "awaiting_approval") {
    return { label: "承認待ち", detail: "実行前の確認が必要です" };
  }
  const failure = explainAutomationFailure(entry.error, entry.errorCode);
  return { label: "失敗", detail: `${failure.title}。${failure.body}` };
}

export function assertNoUxJargon(text: string): boolean {
  return !AUTOMATION_UX_JARGON_RE.test(text);
}
