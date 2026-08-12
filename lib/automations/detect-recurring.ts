import {
  buildCreateInputFromForm,
  defaultAutomationFormState,
  syncExecutionFlowFromJobText,
  type AutomationFormState,
} from "./form-utils";
import type { CreateAutomationInput } from "./types";

export type RecurringIntentDetection = {
  detected: true;
  suggestionMessage: string;
  formDefaults: AutomationFormState;
  createInput: CreateAutomationInput;
};

export type RecurringIntentResult =
  | RecurringIntentDetection
  | { detected: false };

/**
 * Gate for recurring NL. Must include 毎朝/毎晩 — Production evidence that
 * 「毎朝9時に…」 was missed when only 毎日 was listed.
 */
const RECURRING_PATTERN =
  /毎日|毎朝|毎晩|毎夕|毎週|毎月|定期|習慣|自動で|ルーティン|定例/i;

/** One-shot / today-only phrasing must NOT create automations. */
const ONE_SHOT_PATTERN =
  /今日の|きょうの|本日の|今すぐ|いまから|このあと|単発|一回だけ|1回だけ/;

const TIME_PATTERN = /(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/;

// Must require 毎週 — optional 週 would falsely match 毎日 (毎 + 日).
const WEEKDAY_PATTERN =
  /毎週\s*(日|月|火|水|木|金|土)(?:曜日|ようび)?/;

const MONTH_DAY_PATTERN =
  /毎月\s*(\d{1,2})\s*日|毎月\s*(\d{1,2})日|月初め|月初/;

function extractHourMinute(text: string): { hour: number; minute: number } {
  const match = text.match(TIME_PATTERN);
  if (!match) {
    // 毎朝 / 毎晩 without explicit clock → sensible defaults
    if (/毎晩|毎夕/.test(text)) return { hour: 21, minute: 0 };
    if (/毎朝/.test(text)) return { hour: 9, minute: 0 };
    return { hour: 9, minute: 0 };
  }
  const hour = Math.min(23, Math.max(0, Number.parseInt(match[1]!, 10)));
  const minute = match[2]
    ? Math.min(59, Math.max(0, Number.parseInt(match[2], 10)))
    : 0;
  return { hour, minute };
}

function extractDayOfWeek(text: string): number {
  const m = text.match(WEEKDAY_PATTERN);
  if (!m) {
    if (/金曜/.test(text)) return 5;
    if (/月曜/.test(text)) return 1;
    if (/火曜/.test(text)) return 2;
    if (/水曜/.test(text)) return 3;
    if (/木曜/.test(text)) return 4;
    if (/土曜/.test(text)) return 6;
    if (/日曜/.test(text)) return 0;
    return 1;
  }
  const map: Record<string, number> = {
    日: 0,
    月: 1,
    火: 2,
    水: 3,
    木: 4,
    金: 5,
    土: 6,
  };
  return map[m[1]!] ?? 1;
}

function extractDayOfMonth(text: string): number {
  const m = text.match(MONTH_DAY_PATTERN);
  if (!m) return 1;
  if (/月初め|月初/.test(text)) return 1;
  const n = Number.parseInt(m[1] || m[2] || "1", 10);
  return Math.min(28, Math.max(1, Number.isFinite(n) ? n : 1));
}

export function inferFrequency(text: string): "daily" | "weekly" | "monthly" {
  if (/毎月|月次|月初|月初め/.test(text)) return "monthly";
  if (/毎週|週次/.test(text) || WEEKDAY_PATTERN.test(text)) return "weekly";
  if (/毎日|日次|毎朝|毎晩|毎夕/.test(text)) return "daily";
  return "weekly";
}

function inferTitle(text: string): string {
  if (/x\b|twitter|ツイート|sns|投稿/i.test(text)) return "SNS投稿";
  if (/ブログ|記事/i.test(text)) return "ブログ作成";
  if (/ニュース|要約|まとめて|まとめ/i.test(text)) return "定期まとめ";
  if (/予定|スケジュール/i.test(text)) return "予定まとめ";
  if (/ココナラ|募集/i.test(text)) return "ココナラ更新";
  if (/営業資料|提案資料|プレゼン|スライド/i.test(text)) return "営業資料";
  if (/メール|mail/i.test(text)) return "メール確認";
  if (/ファイル|整理|drive/i.test(text)) return "ファイル整理";
  if (/報告|レポート/i.test(text)) return "定期報告";
  return "定期業務";
}

function inferDescription(title: string, text: string): string {
  return `${title} — 依頼「${text.slice(0, 80)}」から登録`;
}

function buildDetection(text: string): RecurringIntentDetection {
  const frequency = inferFrequency(text);
  const { hour, minute } = extractHourMinute(text);
  const title = inferTitle(text);
  const destination =
    /x\b|twitter|ツイート|sns|投稿/i.test(text) ? ("x" as const) : ("none" as const);

  // NL auto-create must not escalate to full_auto by default (approval intact).
  // X destination keeps approve_then_run unless user later changes it.
  const formDefaults = syncExecutionFlowFromJobText(
    defaultAutomationFormState({
      title,
      assignment: text.endsWith("。") ? text : `${text}。`,
      description: inferDescription(title, text),
      destination,
      frequency,
      hour,
      minute,
      dayOfWeek: extractDayOfWeek(text),
      dayOfMonth: extractDayOfMonth(text),
      executionLevel: "approve_then_run",
    }),
  );

  return {
    detected: true,
    suggestionMessage: "定期業務として登録します。",
    formDefaults,
    createInput: buildCreateInputFromForm(formDefaults),
  };
}

/** Detect recurring-work phrasing in chat or workspace input (client-safe). */
export function detectRecurringIntent(text: string): RecurringIntentResult {
  const trimmed = text.trim();
  if (!trimmed) return { detected: false };
  if (ONE_SHOT_PATTERN.test(trimmed) && !RECURRING_PATTERN.test(trimmed)) {
    return { detected: false };
  }
  // 「今日のニュースをまとめて」— one-shot; do not treat まとめて alone as recurring
  if (ONE_SHOT_PATTERN.test(trimmed) && !/毎日|毎朝|毎晩|毎夕|毎週|毎月|定期|習慣/.test(trimmed)) {
    return { detected: false };
  }
  if (!RECURRING_PATTERN.test(trimmed)) {
    return { detected: false };
  }
  return buildDetection(trimmed);
}

export function prefillFromAssignment(assignment: string): AutomationFormState {
  const result = detectRecurringIntent(assignment);
  if (result.detected) return result.formDefaults;
  const destination =
    /x\b|twitter|ツイート|sns|投稿/i.test(assignment) ? ("x" as const) : ("none" as const);
  return syncExecutionFlowFromJobText(
    defaultAutomationFormState({
      title: inferTitle(assignment),
      assignment,
      description: inferDescription(inferTitle(assignment), assignment),
      destination,
      executionLevel: "approve_then_run",
    }),
  );
}
