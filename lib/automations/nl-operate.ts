/**
 * Natural-language operate (edit / pause / resume / delete / ask).
 * Does not invent a second Automation engine — parse only.
 */

import { detectRecurringIntent } from "@/lib/automations/detect-recurring";
import type { Automation, AutomationExecutionLevel } from "@/lib/automations/types";

export type AutomationNlOperateKind =
  | "none"
  | "update_time"
  | "update_weekdays"
  | "update_content"
  | "update_approval"
  | "pause"
  | "resume"
  | "delete"
  | "confirm_delete"
  | "ask_next";

export type AutomationNlOperateParse = {
  kind: AutomationNlOperateKind;
  hour?: number;
  minute?: number;
  weekdays?: number[];
  dayOfWeek?: number;
  frequency?: "daily" | "weekly" | "monthly";
  contentOverride?: Partial<{
    length: "short" | "long";
    emoji: "none" | "few" | "many";
    hashtags: "none";
  }>;
  approval?: AutomationExecutionLevel;
  wantsX?: boolean;
};

const PAUSE_RE = /一旦止めて|一時停止|止めて(?:ください)?|停止して|動かさないで/;
const RESUME_RE = /また(動かして|再開|始めて)|再開して|また動かして/;
const DELETE_RE = /消して|削除して/;
const CONFIRM_DELETE_RE = /消していい|削除して確定|削除でお願い|削除してよい/;
const ASK_NEXT_RE = /次いつ|いつ(投稿|実行)|次回は|次はいつ/;
const WEEKDAY_ONLY_RE = /平日だけ/;
const TIME_CHANGE_RE =
  /(?:を)?(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?(?:に)?(?:変え|変更)|(\d{1,2})\s*時にして/;
const X_TARGET_RE = /Xのやつ|X投稿|ツイート|エックス/;

function isFreshCreate(text: string): boolean {
  if (/変え|変更|止めて|再開|消して|削除|次いつ/.test(text)) return false;
  const recurring = detectRecurringIntent(text);
  return recurring.detected && /投稿して|まとめて|作成して|登録して/.test(text);
}

export function parseAutomationNlOperate(text: string): AutomationNlOperateParse {
  const trimmed = text.trim();
  if (!trimmed || isFreshCreate(trimmed)) {
    return { kind: "none" };
  }

  if (CONFIRM_DELETE_RE.test(trimmed)) {
    return { kind: "confirm_delete", wantsX: X_TARGET_RE.test(trimmed) };
  }
  if (DELETE_RE.test(trimmed)) {
    return { kind: "delete", wantsX: X_TARGET_RE.test(trimmed) };
  }
  if (PAUSE_RE.test(trimmed)) {
    return { kind: "pause", wantsX: X_TARGET_RE.test(trimmed) };
  }
  if (RESUME_RE.test(trimmed)) {
    return { kind: "resume", wantsX: X_TARGET_RE.test(trimmed) };
  }
  if (ASK_NEXT_RE.test(trimmed)) {
    return { kind: "ask_next", wantsX: X_TARGET_RE.test(trimmed) };
  }

  if (WEEKDAY_ONLY_RE.test(trimmed)) {
    return {
      kind: "update_weekdays",
      weekdays: [1, 2, 3, 4, 5],
      frequency: "daily",
      wantsX: X_TARGET_RE.test(trimmed),
    };
  }

  const weekly = trimmed.match(/毎週\s*(日|月|火|水|木|金|土)/);
  if (weekly && /にして|変え|変更/.test(trimmed)) {
    const map: Record<string, number> = {
      日: 0,
      月: 1,
      火: 2,
      水: 3,
      木: 4,
      金: 5,
      土: 6,
    };
    return {
      kind: "update_weekdays",
      dayOfWeek: map[weekly[1]!] ?? 1,
      frequency: "weekly",
      wantsX: X_TARGET_RE.test(trimmed),
    };
  }

  const time = trimmed.match(TIME_CHANGE_RE);
  if (time) {
    const hour = Number.parseInt(time[1] || time[3] || "9", 10);
    const minute = time[2] ? Number.parseInt(time[2], 10) : 0;
    return {
      kind: "update_time",
      hour: Math.min(23, Math.max(0, hour)),
      minute: Math.min(59, Math.max(0, minute)),
      wantsX: X_TARGET_RE.test(trimmed),
    };
  }

  if (/確認なし|自動で(実行|出して)|即実行/.test(trimmed) && !isFreshCreate(trimmed)) {
    return {
      kind: "update_approval",
      approval: "full_auto",
      wantsX: X_TARGET_RE.test(trimmed),
    };
  }
  if (/実行前に確認|投稿前に確認|必ず確認/.test(trimmed) && !/毎朝|毎日|毎週/.test(trimmed)) {
    return {
      kind: "update_approval",
      approval: "approve_then_run",
      wantsX: X_TARGET_RE.test(trimmed),
    };
  }

  if (
    /この(自動化|投稿|仕事)だけ|もう少し短め|詳しく|長めにして|絵文字なし/.test(
      trimmed,
    )
  ) {
    const contentOverride: AutomationNlOperateParse["contentOverride"] = {};
    if (/短め|短く/.test(trimmed)) contentOverride.length = "short";
    if (/詳しく|長め/.test(trimmed)) contentOverride.length = "long";
    if (/絵文字なし/.test(trimmed)) contentOverride.emoji = "none";
    if (/ハッシュタグなし/.test(trimmed)) contentOverride.hashtags = "none";
    return {
      kind: "update_content",
      contentOverride,
      wantsX: X_TARGET_RE.test(trimmed) || /この投稿だけ/.test(trimmed),
    };
  }

  return { kind: "none" };
}

export function matchAutomationsForOperate(
  automations: readonly Automation[],
  parsed: AutomationNlOperateParse,
): Automation[] {
  const active = automations.filter((row) => row.id);
  if (parsed.wantsX) {
    const xOnly = active.filter(
      (row) =>
        row.destination === "x" ||
        /X|ツイート|sns/i.test(`${row.name} ${row.workflow.assignment}`),
    );
    return xOnly.length > 0 ? xOnly : active;
  }
  return active;
}

export function formatAutomationChoicePrompt(automations: readonly Automation[]): string {
  const lines = automations.slice(0, 5).map((row, index) => {
    const schedule =
      row.schedule.kind === "schedule" ? row.schedule.label : "予定なし";
    return `${index + 1}. ${row.name}（${schedule}）`;
  });
  return `対象の自動化が複数あります。どれを変更しますか？\n${lines.join("\n")}`;
}
