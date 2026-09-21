import { FIELD_CATALOG, getFieldEntry } from "./field-catalog";
import {
  getRecurringValue,
  isFieldSaved,
  isFieldSuggestionVisible,
  recordInputObservation,
} from "./persistence";
import type {
  AnalyzeDeliverableInput,
  FieldSuggestion,
  QualityImprovement,
  SmartProfileFieldKey,
  SmartProfileSuggestionModel,
  SuggestionReason,
} from "./types";

type DetectedGap = {
  key: SmartProfileFieldKey;
  reason: SuggestionReason;
  suggestedValue: string;
};

const PLACEHOLDER_PATTERNS: Array<{
  key: SmartProfileFieldKey;
  pattern: RegExp;
}> = [
  {
    key: "company_name",
    pattern:
      /\[.?会社名.?\]|（会社名）|株式会社[〇○●◯．.…]{1,4}|御社名|貴社名|会社名未定|貴社/i,
  },
  {
    key: "contact_name",
    pattern: /\[.?担当者.?\]|ご担当者様|担当者名|担当：\s*$|担当者未定/i,
  },
  {
    key: "company_phone",
    pattern: /\[.?電話.?\]|電話番号[：:]\s*$|TEL[：:]\s*$|お電話番号/i,
  },
  {
    key: "company_email",
    pattern: /\[.?メール.?\]|メールアドレス[：:]\s*$|@example\.|example@/i,
  },
  {
    key: "company_address",
    pattern: /\[.?住所.?\]|住所[：:]\s*$|所在地[：:]\s*$/i,
  },
  {
    key: "logo",
    pattern: /\[.?ロゴ.?\]|会社ロゴ|ロゴ画像|logo\s*here|ロゴを挿入/i,
  },
  {
    key: "company_intro",
    pattern: /会社紹介を追加|\[.?会社紹介.?\]|会社概要を記入|弊社について（未記入）/i,
  },
  {
    key: "signature",
    pattern: /\[.?署名.?\]|署名を追加|――{3,}|_{6,}|署名欄/i,
  },
  {
    key: "invoice_number",
    pattern: /\[.?登録番号.?\]|インボイス番号|T\d{0,13}\?|登録番号[：:]\s*$/i,
  },
  {
    key: "bank_info",
    pattern: /\[.?口座.?\]|振込先[：:]\s*$|口座情報|銀行名[：:]\s*$/i,
  },
  {
    key: "sales_area",
    pattern: /\[.?営業エリア.?\]|対応エリア[：:]\s*$|営業エリア未定/i,
  },
  {
    key: "channel_name",
    pattern: /\[.?チャンネル名.?\]|チャンネル名[：:]\s*$/i,
  },
  {
    key: "tone",
    pattern: /\[.?口調.?\]|トーン未設定|口調を指定/i,
  },
  {
    key: "brand_color",
    pattern: /\[.?ブランドカラー.?\]|ブランドカラー未設定/i,
  },
  {
    key: "cta",
    pattern: /\[.?CTA.?\]|呼びかけ未設定|詳しくはこちら（仮）/i,
  },
];

const VALUE_EXTRACTORS: Array<{
  key: SmartProfileFieldKey;
  pattern: RegExp;
}> = [
  {
    key: "company_name",
    pattern:
      /((?:株式会社|有限会社|合同会社)[^\s　、。]{2,40}|[^\s　、。]{2,40}(?:株式会社|有限会社|合同会社))/u,
  },
  {
    key: "company_phone",
    pattern: /0\d{1,4}[-(]?\d{1,4}[-)]?\d{3,4}/,
  },
  {
    key: "company_email",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  },
  {
    key: "company_website",
    pattern: /https?:\/\/[^\s　]+/i,
  },
];

function haystack(input: AnalyzeDeliverableInput): string {
  return [input.title, input.content, input.workRequest].filter(Boolean).join("\n");
}

function baseKeysForType(deliverableType: string, workRequest: string): SmartProfileFieldKey[] {
  const text = `${deliverableType} ${workRequest}`.toLowerCase();
  const keys = new Set<SmartProfileFieldKey>();

  if (/email|メール/.test(text) || deliverableType === "email") {
    ["signature", "contact_name", "company_name", "company_email", "job_title"].forEach(
      (key) => keys.add(key as SmartProfileFieldKey),
    );
  }

  if (
    deliverableType === "proposal" ||
    deliverableType === "presentation" ||
    deliverableType === "report" ||
    /営業|提案|資料|会社案内/.test(text)
  ) {
    [
      "company_name",
      "contact_name",
      "company_phone",
      "company_intro",
      "logo",
      "sales_area",
      "specialty",
      "service_description",
    ].forEach((key) => keys.add(key as SmartProfileFieldKey));
  }

  if (
    deliverableType === "social_post" ||
    /sns|投稿|ツイート|x投稿|instagram|tiktok/.test(text)
  ) {
    ["tone", "brand_color", "cta", "x_account", "channel_name"].forEach((key) =>
      keys.add(key as SmartProfileFieldKey),
    );
  }

  if (/youtube|動画|チャンネル/.test(text)) {
    ["channel_name", "tone", "cta", "youtube"].forEach((key) =>
      keys.add(key as SmartProfileFieldKey),
    );
  }

  if (/請求|invoice|見積|領収/.test(text)) {
    [
      "company_name",
      "company_address",
      "invoice_number",
      "bank_info",
      "company_phone",
    ].forEach((key) => keys.add(key as SmartProfileFieldKey));
  }

  if (keys.size === 0) {
    ["company_name", "contact_name", "signature"].forEach((key) =>
      keys.add(key as SmartProfileFieldKey),
    );
  }

  return [...keys];
}

function detectPlaceholders(text: string): SmartProfileFieldKey[] {
  const found: SmartProfileFieldKey[] = [];
  for (const { key, pattern } of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text)) found.push(key);
  }
  return found;
}

function extractValues(text: string): Partial<Record<SmartProfileFieldKey, string>> {
  const values: Partial<Record<SmartProfileFieldKey, string>> = {};
  for (const { key, pattern } of VALUE_EXTRACTORS) {
    const match = text.match(pattern);
    if (match?.[0]) values[key] = match[0].trim();
  }
  return values;
}

function toSuggestion(
  key: SmartProfileFieldKey,
  reason: SuggestionReason,
  suggestedValue: string,
): FieldSuggestion {
  const entry = getFieldEntry(key);
  return {
    key,
    label: entry.label,
    group: entry.group,
    reason,
    suggestedValue,
    benefit: entry.benefit,
  };
}

function buildQuality(suggestions: FieldSuggestion[]): QualityImprovement {
  const impactCount = suggestions.filter((item) => {
    return FIELD_CATALOG[item.key].qualityImpact;
  }).length;
  const stars = (Math.max(1, Math.min(5, impactCount || suggestions.length)) ||
    1) as 1 | 2 | 3 | 4 | 5;
  const points = [...new Set(suggestions.map((item) => item.label))].slice(0, 5);
  return { stars, points };
}

/**
 * Rule-based analysis — no LLM.
 * Safe to call on the client after deliverable completion.
 */
export function analyzeDeliverableForSmartProfile(
  input: AnalyzeDeliverableInput,
  options?: { recordObservations?: boolean },
): SmartProfileSuggestionModel {
  const now = input.now ?? new Date();
  const text = haystack(input);
  const baseKeys = baseKeysForType(input.deliverableType, input.workRequest);
  const placeholderKeys = detectPlaceholders(text);
  const extracted = extractValues(text);

  if (options?.recordObservations !== false) {
    for (const [key, value] of Object.entries(extracted)) {
      if (value) recordInputObservation(key as SmartProfileFieldKey, value);
    }
  }

  const gaps = new Map<SmartProfileFieldKey, DetectedGap>();

  for (const key of placeholderKeys) {
    if (isFieldSaved(key)) continue;
    gaps.set(key, {
      key,
      reason: "missing",
      suggestedValue: extracted[key] ?? "",
    });
  }

  for (const key of baseKeys) {
    if (isFieldSaved(key)) continue;
    const entry = getFieldEntry(key);
    const already = gaps.get(key);
    if (already) {
      if (entry.qualityImpact) already.reason = "quality_impact";
      continue;
    }
    // High-impact fields for this deliverable kind, still empty in content
    // → quality opportunity (not a fake score — factual improvement levers).
    if (entry.qualityImpact && !extracted[key]) {
      gaps.set(key, {
        key,
        reason: "quality_impact",
        suggestedValue: "",
      });
    }
  }

  for (const key of Object.keys(FIELD_CATALOG) as SmartProfileFieldKey[]) {
    if (isFieldSaved(key)) continue;
    const recurring = getRecurringValue(key);
    if (!recurring) continue;
    const existing = gaps.get(key);
    if (existing) {
      existing.reason = "recurring";
      existing.suggestedValue = existing.suggestedValue || recurring;
    } else {
      gaps.set(key, {
        key,
        reason: "recurring",
        suggestedValue: recurring,
      });
    }
  }

  const prioritized = [...gaps.values()].filter((gap) =>
    isFieldSuggestionVisible(gap.key, now),
  );
  const hasStrongSignal = prioritized.some(
    (gap) => gap.reason === "missing" || gap.reason === "recurring",
  );
  // Without placeholders/recurring, keep quality tips short so it never feels pushy.
  const limited = hasStrongSignal
    ? prioritized
    : prioritized.filter((gap) => gap.reason === "quality_impact").slice(0, 3);

  const suggestions = limited
    .map((gap) => toSuggestion(gap.key, gap.reason, gap.suggestedValue))
    .slice(0, 6);

  const missingLabels = suggestions
    .filter((item) => item.reason === "missing" || item.reason === "quality_impact")
    .map((item) => item.label);

  return {
    shouldShow: suggestions.length > 0,
    quality: buildQuality(suggestions),
    suggestions,
    missingLabels,
  };
}
