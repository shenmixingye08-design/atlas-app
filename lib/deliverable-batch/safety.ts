const FABRICATION_PATTERNS = [
  /売上[0-9,，億万千百]+/,
  /受賞/,
  /資格取得/,
  /顧客名[:：]/,
  /電話番号/,
  /補助金[をが]/,
  /診断します/,
  /治療します/,
  /投資助言/,
];

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|above) instructions/i,
  /system prompt/i,
  /you are (now )?(an? )?(admin|root|system)/i,
  /<\/?(?:system|assistant|tool)>/i,
  /OPENAI_API_KEY|CLERK_SECRET|SUPABASE_SERVICE_ROLE/i,
];

export function stripPromptInjection(text: string): string {
  return text
    .split("\n")
    .filter((line) => !INJECTION_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n")
    .slice(0, 8_000);
}

export function looksLikeFabrication(text: string): boolean {
  return FABRICATION_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeUserItemText(text: string): string {
  return stripPromptInjection(text).replace(/\0/g, "").trim();
}

export const NO_FABRICATION_RULE =
  "会社実績・売上・価格・資格・受賞歴・顧客名・住所・電話番号・法律・補助金・医療・金融の事実は、入力に無い限り書かない。別の項目の情報を混ぜない。";
