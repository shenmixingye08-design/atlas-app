/**
 * Strip fabricated / unsafe claims from generated X batch copy.
 * When facts are missing, keep a generic safe sentence instead of inventing.
 */

const FABRICATION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /売上[をは]?[0-9０-９,.，．]+/, label: "売上数値" },
  { pattern: /年商[0-9０-９,.，．]+/, label: "年商" },
  { pattern: /確実に(売れる|成果|成功|増える)/, label: "成果保証" },
  { pattern: /必ず(成果|成功|売れる|増)/, label: "効果保証" },
  { pattern: /売上を保証/, label: "売上保証" },
  { pattern: /(受賞|表彰)(歴|経験|いたしました)/, label: "受賞歴" },
  { pattern: /(国家資格|公認会計士|弁護士|税理士)(です|取得)/, label: "資格" },
  { pattern: /補助金(が|を)?(使えます|対象|下り)/, label: "補助金" },
  { pattern: /(法律|制度)(では|により)(必ず|全員)/, label: "制度" },
  { pattern: /0?(\d{1,4})-(\d{1,4})-(\d{3,4})/, label: "電話番号" },
  { pattern: /〒?\d{3}-?\d{4}/, label: "郵便番号" },
  { pattern: /営業時間[:：]/, label: "営業時間" },
  { pattern: /東京都.+区.+[-ー]\d/, label: "住所" },
];

const SAFE_FALLBACK =
  "今日の仕事を一つだけ前に進める。小さく始めて、続けていくことが近道です。";

export function detectUnsafeBatchClaims(text: string): string[] {
  const hits: string[] = [];
  for (const rule of FABRICATION_PATTERNS) {
    if (rule.pattern.test(text)) hits.push(rule.label);
  }
  return hits;
}

export function sanitizeBatchPostText(text: string): {
  text: string;
  replaced: boolean;
  reasons: string[];
} {
  const reasons = detectUnsafeBatchClaims(text);
  if (reasons.length === 0) {
    return { text: text.trim(), replaced: false, reasons: [] };
  }
  return { text: SAFE_FALLBACK, replaced: true, reasons };
}

export function extractHashtags(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const tag = match[2];
    if (tag) tags.push(`#${tag}`);
  }
  return tags;
}

export function applyHashtagPolicy(input: {
  text: string;
  policy: string;
  theme: string;
}): string {
  const policy = input.policy.trim();
  const text = input.text.trim();
  const existing = extractHashtags(text);

  if (/付けない|なし|不要|禁止/.test(policy)) {
    return text.replace(/(^|\s)[#＃][\p{L}\p{N}_]+/gu, "").trim();
  }

  const maxMatch = /(\d+)\s*個/.exec(policy);
  const max = maxMatch ? Math.min(3, Number(maxMatch[1])) : /付ける|必要/.test(policy) ? 2 : 0;
  if (max <= 0) return text;
  if (existing.length >= max) return text;

  const themeTag = input.theme.replace(/[\s#＃]/g, "").slice(0, 12);
  if (!themeTag) return text;
  const next = `#${themeTag}`;
  if (existing.some((tag) => tag.toLowerCase() === next.toLowerCase())) return text;
  return `${text} ${next}`.trim();
}
