/**
 * Structured X / social-post preferences.
 * Merge is deterministic — no extra LLM call.
 *
 * Priority: explicit instruction > automation override > personal memory > default
 */

import type { ResolvedMemoryValue } from "@/lib/personal-memory/types";
import type { PersonalMemoryScope } from "@/lib/personal-memory/types";

export const X_MEMORY_ALLOWED_SCOPES: readonly PersonalMemoryScope[] = [
  "writing_style",
  "approval_preferences",
  "work_content_style",
  "recurring_work_preferences",
  "automation_execution",
  "notification_preferences",
  "timezone",
];

export const X_MEMORY_DENIED_SCOPES: readonly PersonalMemoryScope[] = [
  "excel_template",
  "word_template",
  "powerpoint_theme",
  "pdf_layout",
  "sheet_naming",
  "currency",
  "contact_info",
  "customer_info",
  "calendar_defaults",
  "wordpress_defaults",
  "color_palette",
  "document_design",
];

export type XEmojiPreference = "none" | "few" | "many" | null;
export type XLengthPreference = "short" | "medium" | "long" | null;
export type XPromotionalPreference = "none" | "weak" | "strong" | null;
export type XLineBreakPreference = "compact" | "spaced" | null;
export type XApprovalPreference = "approve_then_run" | "full_auto" | null;

export type XSocialPreference = {
  tone: string | null;
  length: XLengthPreference;
  emoji: XEmojiPreference;
  hashtags: "none" | "limited" | "any" | null;
  hashtagsMax: number | null;
  lineBreaks: XLineBreakPreference;
  promotional: XPromotionalPreference;
  cta: boolean | null;
  theme: string | null;
  postingHour: number | null;
  approval: XApprovalPreference;
};

export const EMPTY_X_SOCIAL_PREFERENCE: XSocialPreference = {
  tone: null,
  length: null,
  emoji: null,
  hashtags: null,
  hashtagsMax: null,
  lineBreaks: null,
  promotional: null,
  cta: null,
  theme: null,
  postingHour: null,
  approval: null,
};

export function parseXSocialPreferenceFromText(
  text: string,
): Partial<XSocialPreference> {
  const out: Partial<XSocialPreference> = {};
  if (/短め|短く|簡潔|短文/.test(text)) out.length = "short";
  if (/長文|詳しく|詳細に/.test(text) && out.length !== "short") {
    out.length = "long";
  }
  if (/絵文字\s*(なし|無し|やめて|を使わない)|絵文字なし/.test(text)) {
    out.emoji = "none";
  } else if (/絵文字\s*(少なめ|控えめ)/.test(text)) {
    out.emoji = "few";
  } else if (/絵文字\s*(多め|たくさん)/.test(text)) {
    out.emoji = "many";
  }
  const hashCount = text.match(/ハッシュタグ\s*(?:は|最大)?\s*(\d+)\s*個/);
  if (hashCount) {
    out.hashtagsMax = Math.min(8, Math.max(0, Number.parseInt(hashCount[1]!, 10)));
    out.hashtags = out.hashtagsMax === 0 ? "none" : "limited";
  } else if (/ハッシュタグ(なし|無し|やめて|を使わない|なしで)/.test(text)) {
    out.hashtags = "none";
    out.hashtagsMax = 0;
  }
  if (/改行(少なめ|なし|少な[めく])/.test(text)) out.lineBreaks = "compact";
  if (/改行(多め|多めに)/.test(text)) out.lineBreaks = "spaced";
  if (/強い営業|営業文禁止|宣伝(色)?(強すぎ|禁止)|強い宣伝/.test(text)) {
    out.promotional = "none";
  } else if (/宣伝は控えめ|宣伝色(は)?弱/.test(text)) {
    out.promotional = "weak";
  }
  if (/CTA(なし|無し)|誘導なし/.test(text)) out.cta = false;
  else if (/\bCTA\b|行動喚起|誘導をつけて/.test(text)) out.cta = true;
  if (/丁寧|敬語/.test(text)) out.tone = "polite";
  if (/カジュアル/.test(text)) out.tone = "casual";
  if (/投稿前に確認|必ず確認|承認してから|確認してから/.test(text)) {
    out.approval = "approve_then_run";
  } else if (
    /確認なし|実行前確認なし|即実行|そのまま(投稿|出して)|自動で投稿/.test(text)
  ) {
    out.approval = "full_auto";
  }
  const hour = text.match(/(\d{1,2})\s*時/);
  if (hour && /投稿|ポスト/.test(text)) {
    out.postingHour = Math.min(23, Math.max(0, Number.parseInt(hour[1]!, 10)));
  }
  return out;
}

function readPref(values: readonly ResolvedMemoryValue[]): XSocialPreference {
  const merged = { ...EMPTY_X_SOCIAL_PREFERENCE };
  for (const row of values) {
    const v = row.value;
    if (typeof v.length === "string") {
      if (v.length === "short" || v.length === "long" || v.length === "medium") {
        merged.length = v.length;
      }
    }
    if (typeof v.emoji === "string") {
      if (v.emoji === "none" || v.emoji === "few" || v.emoji === "many") {
        merged.emoji = v.emoji;
      }
    }
    if (typeof v.hashtagsMax === "number") merged.hashtagsMax = v.hashtagsMax;
    if (v.hashtags === "none" || v.hashtags === "limited" || v.hashtags === "any") {
      merged.hashtags = v.hashtags;
    }
    if (typeof v.tone === "string") merged.tone = v.tone;
    if (v.lineBreaks === "compact" || v.lineBreaks === "spaced") {
      merged.lineBreaks = v.lineBreaks;
    }
    if (
      v.promotional === "none" ||
      v.promotional === "weak" ||
      v.promotional === "strong"
    ) {
      merged.promotional = v.promotional;
    }
    if (typeof v.cta === "boolean") merged.cta = v.cta;
    if (typeof v.theme === "string") merged.theme = v.theme;
    if (typeof v.postingHour === "number") merged.postingHour = v.postingHour;
    if (v.approval === "approve_then_run" || v.approval === "full_auto") {
      merged.approval = v.approval;
    }
    if (row.scope === "approval_preferences") {
      if (v.mode === "full_auto" || v.executionLevel === "full_auto") {
        merged.approval = "full_auto";
      }
      if (
        v.mode === "approve_then_run" ||
        v.executionLevel === "approve_then_run"
      ) {
        merged.approval = "approve_then_run";
      }
    }
  }
  return merged;
}

function overlayDefined<T extends Record<string, unknown>>(
  base: T,
  patch: Partial<T>,
): T {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && value !== null) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

/**
 * Merge layers. Explicit / automation override win over Memory.
 */
export function mergeXSocialPreference(input: {
  memory?: Partial<XSocialPreference> | null;
  automationOverride?: Partial<XSocialPreference> | null;
  explicit?: Partial<XSocialPreference> | null;
}): XSocialPreference {
  return overlayDefined(
    overlayDefined(
      overlayDefined(EMPTY_X_SOCIAL_PREFERENCE, input.memory ?? {}),
      input.automationOverride ?? {},
    ),
    input.explicit ?? {},
  );
}

export function memoryRowAppliesToX(row: ResolvedMemoryValue): boolean {
  const channel = row.value.channel;
  if (
    channel === "word" ||
    channel === "excel" ||
    channel === "wordpress" ||
    channel === "email"
  ) {
    return false;
  }
  if (
    row.scope === "excel_template" ||
    row.scope === "word_template" ||
    row.scope === "contact_info" ||
    row.scope === "currency"
  ) {
    return false;
  }
  const hay = `${row.summary} ${typeof row.value.text === "string" ? row.value.text : ""}`;
  if (/家計簿|会社用|社内文書|Excel列順/.test(hay) && !/X|sns|ツイート/i.test(hay)) {
    return false;
  }
  return true;
}

export function xSocialPreferenceFromResolved(
  values: readonly ResolvedMemoryValue[],
): XSocialPreference {
  return readPref(values.filter(memoryRowAppliesToX));
}

export function describeXSocialPreference(
  pref: XSocialPreference,
): string[] {
  const labels: string[] = [];
  if (pref.length === "short") labels.push("短めの文章");
  if (pref.length === "long") labels.push("詳しい長文");
  if (pref.emoji === "none") labels.push("絵文字なし");
  if (pref.emoji === "few") labels.push("絵文字少なめ");
  if (pref.emoji === "many") labels.push("絵文字多め");
  if (pref.hashtags === "none" || pref.hashtagsMax === 0) {
    labels.push("ハッシュタグなし");
  } else if (pref.hashtagsMax != null) {
    labels.push(`ハッシュタグ最大${pref.hashtagsMax}個`);
  }
  if (pref.promotional === "none") labels.push("強い営業文なし");
  if (pref.promotional === "weak") labels.push("宣伝は控えめ");
  if (pref.cta === true) labels.push("CTAあり");
  if (pref.cta === false) labels.push("CTAなし");
  if (pref.lineBreaks === "compact") labels.push("改行少なめ");
  if (pref.approval === "full_auto") labels.push("即実行");
  if (pref.approval === "approve_then_run") labels.push("投稿前に確認");
  if (pref.tone === "polite") labels.push("丁寧な文体");
  if (pref.tone === "casual") labels.push("カジュアルな文体");
  return labels;
}

export const MEMORY_APPLY_EXTRA_LLM_CALLS = 0;
