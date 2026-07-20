/**
 * Types + presets for the ATLAS X AI auto-post ("秘書おまかせ投稿") feature.
 * This module is client-safe (no server-only imports) so the UI can reuse the
 * presets and shapes.
 */

export type XAutoPostMode = "full_auto" | "approval";

export type XAutoPostFrequency =
  | "daily_1"
  | "daily_2"
  | "daily_3"
  | "weekly_1"
  | "weekly_3"
  | "custom";

/** Rotated to vary the flavor of generated posts. */
export type XAutoPostType =
  | "problem" // 問題提起
  | "knowhow" // ノウハウ
  | "question" // 質問
  | "empathy" // 共感
  | "service" // サービス紹介
  | "case" // 事例
  | "cta" // CTA
  | "oneline"; // 短い一言

export type XAutoPostSettings = {
  userId: string;
  enabled: boolean;
  mode: XAutoPostMode;
  purpose: string;
  themes: string[];
  audience: string;
  tone: string;
  frequency: XAutoPostFrequency;
  /** 0 (Sun) - 6 (Sat), used for weekly_* / custom. */
  daysOfWeek: number[];
  /** "HH:mm" (Asia/Tokyo). */
  postTimes: string[];
  timezone: string;
  includeHashtags: boolean;
  createdAt: string;
  updatedAt: string;
};

export type XAutoPostRunStatus =
  | "processing"
  | "posted"
  | "drafted"
  | "failed"
  | "skipped";

export type XAutoPostRun = {
  id: string;
  userId: string;
  slotKey: string;
  scheduledFor: string | null;
  status: XAutoPostRunStatus;
  mode: XAutoPostMode;
  postType: XAutoPostType | null;
  text: string | null;
  tweetId: string | null;
  tweetUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type XAutoPostStatusResult =
  | {
      status: "ready";
      settings: XAutoPostSettings;
      connected: boolean;
      accountUsername: string | null;
      nextScheduledFor: string | null;
      recentRuns: XAutoPostRun[];
    }
  | {
      status: "feature_disabled";
      message: string;
    };

/** Purpose presets (商品・サービスの宣伝 …). */
export const X_AUTOPOST_PURPOSE_PRESETS = [
  "商品・サービスの宣伝",
  "見込み客の獲得",
  "認知度向上",
  "日常・活動報告",
  "有益情報の発信",
  "フォロワー増加",
] as const;

/** Audience presets (個人事業主 …). */
export const X_AUTOPOST_AUDIENCE_PRESETS = [
  "個人事業主",
  "中小企業",
  "営業職",
  "学生",
  "一般ユーザー",
] as const;

/** Tone presets (丁寧 …). */
export const X_AUTOPOST_TONE_PRESETS = [
  "丁寧",
  "親しみやすい",
  "専門的",
  "面白い",
  "短く簡潔",
  "熱意のある表現",
] as const;

export const X_AUTOPOST_FREQUENCY_OPTIONS: {
  id: XAutoPostFrequency;
  label: string;
  /** Recommended number of post times shown in the UI. */
  times: number;
  /** true when the user must also pick days of week. */
  needsDays: boolean;
}[] = [
  { id: "daily_1", label: "毎日1回", times: 1, needsDays: false },
  { id: "daily_2", label: "毎日2回", times: 2, needsDays: false },
  { id: "daily_3", label: "毎日3回", times: 3, needsDays: false },
  { id: "weekly_1", label: "週1回", times: 1, needsDays: true },
  { id: "weekly_3", label: "週3回", times: 1, needsDays: true },
  { id: "custom", label: "曜日を指定", times: 1, needsDays: true },
];

export const X_AUTOPOST_WEEKDAY_LABELS = [
  "日",
  "月",
  "火",
  "水",
  "木",
  "金",
  "土",
] as const;

export const X_AUTOPOST_TYPE_LABELS: Record<XAutoPostType, string> = {
  problem: "問題提起",
  knowhow: "ノウハウ",
  question: "質問",
  empathy: "共感",
  service: "サービス紹介",
  case: "事例",
  cta: "CTA",
  oneline: "短い一言",
};

export const X_AUTOPOST_TYPE_ORDER: XAutoPostType[] = [
  "problem",
  "knowhow",
  "question",
  "empathy",
  "service",
  "case",
  "cta",
  "oneline",
];

export function formatXAutoPostMode(mode: XAutoPostMode): string {
  return mode === "full_auto" ? "完全自動" : "承認制";
}

export function formatXAutoPostFrequency(frequency: XAutoPostFrequency): string {
  return (
    X_AUTOPOST_FREQUENCY_OPTIONS.find((option) => option.id === frequency)
      ?.label ?? frequency
  );
}

/** Default settings for a user who has never configured auto-post. */
export function createDefaultXAutoPostSettings(
  userId: string,
): XAutoPostSettings {
  const now = new Date().toISOString();
  return {
    userId,
    enabled: false,
    mode: "approval",
    purpose: X_AUTOPOST_PURPOSE_PRESETS[0],
    themes: [],
    audience: X_AUTOPOST_AUDIENCE_PRESETS[0],
    tone: X_AUTOPOST_TONE_PRESETS[0],
    frequency: "daily_1",
    daysOfWeek: [],
    postTimes: ["09:00"],
    timezone: "Asia/Tokyo",
    includeHashtags: false,
    createdAt: now,
    updatedAt: now,
  };
}
