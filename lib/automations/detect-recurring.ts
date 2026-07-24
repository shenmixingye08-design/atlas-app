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

const RECURRING_PATTERN =
  /毎日|毎週|毎月|定期|習慣|自動で|ルーティン|定例/i;

const TIME_PATTERN = /(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/;

function extractHourMinute(text: string): { hour: number; minute: number } {
  const match = text.match(TIME_PATTERN);
  if (!match) return { hour: 9, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number.parseInt(match[1], 10)));
  const minute = match[2]
    ? Math.min(59, Math.max(0, Number.parseInt(match[2], 10)))
    : 0;
  return { hour, minute };
}

function inferFrequency(text: string): "daily" | "weekly" | "monthly" {
  if (/毎月|月次|月初/.test(text)) return "monthly";
  if (/毎週|週次/.test(text)) return "weekly";
  if (/毎日|日次|毎朝|毎晩|毎夕/.test(text)) return "daily";
  return "weekly";
}

function inferTitle(text: string): string {
  if (/x|twitter|ツイート|sns|投稿/i.test(text)) return "SNS投稿";
  if (/ブログ|記事/i.test(text)) return "ブログ作成";
  if (/ココナラ|募集/i.test(text)) return "ココナラ更新";
  if (/営業資料|提案資料|プレゼン|スライド/i.test(text)) return "営業資料";
  if (/メール|mail/i.test(text)) return "メール確認";
  if (/ファイル|整理|drive/i.test(text)) return "ファイル整理";
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

  const formDefaults = syncExecutionFlowFromJobText(
    defaultAutomationFormState({
      title,
      assignment: text.endsWith("。") ? text : `${text}。`,
      description: inferDescription(title, text),
      destination,
      frequency,
      hour,
      minute,
      dayOfWeek: /月曜/.test(text) ? 1 : /金曜/.test(text) ? 5 : /水曜/.test(text) ? 3 : 1,
      dayOfMonth: 1,
      executionLevel: destination === "x" ? "full_auto" : undefined,
    }),
  );

  return {
    detected: true,
    suggestionMessage: "これは定期業務として登録できます。",
    formDefaults,
    createInput: buildCreateInputFromForm(formDefaults),
  };
}

/** Detect recurring-work phrasing in chat or workspace input (client-safe). */
export function detectRecurringIntent(text: string): RecurringIntentResult {
  const trimmed = text.trim();
  if (!trimmed || !RECURRING_PATTERN.test(trimmed)) {
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
      executionLevel: destination === "x" ? "full_auto" : undefined,
    }),
  );
}
