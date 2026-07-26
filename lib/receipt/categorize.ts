import type { CategoryLearningRule, ReceiptCategory, ReceiptSchema } from "./types";
import { RECEIPT_CATEGORIES } from "./types";

function storeKey(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

const KEYWORD_CATEGORY: Array<{ pattern: RegExp; category: ReceiptCategory }> = [
  { pattern: /病院|薬局|ドラッグ|医療|クリニック/, category: "医療" },
  { pattern: /電車|バス|タクシー|suica|パスモ|ガソリン|駐車/, category: "交通費" },
  { pattern: /電気|ガス|水道|通信|スマホ/, category: "光熱費" },
  { pattern: /居酒屋|レストラン|カフェ|弁当|コンビニ|スーパー|食品/, category: "食費" },
  { pattern: /ホームセンター|ダイソー|セリア|日用品|洗剤/, category: "日用品" },
  { pattern: /ギフト|贈答|会食|飲み会/, category: "交際費" },
  { pattern: /ゲーム|趣味|本屋|amazon|ヨドバシ/, category: "趣味" },
  { pattern: /オフィス|文具|cop[yi]|名刺|経費/, category: "仕事" },
];

export function suggestCategory(
  schema: ReceiptSchema,
  rules: CategoryLearningRule[],
): ReceiptCategory {
  const store = schema.storeName?.trim() ?? "";
  if (store) {
    const key = storeKey(store);
    const learned = rules
      .filter((rule) => rule.storeKey === key)
      .sort((a, b) => b.hitCount - a.hitCount)[0];
    if (learned) return learned.category;
  }

  const hay = [
    store,
    ...schema.items.map((item) => item.name),
    schema.rawNotes ?? "",
  ].join(" ");

  for (const rule of KEYWORD_CATEGORY) {
    if (rule.pattern.test(hay)) return rule.category;
  }

  if (/ローソン|セブン|ファミマ|ファミリーマート|ミニストップ/.test(store)) {
    return "食費";
  }

  return "その他";
}

export function learnCategoryCorrection(
  rules: CategoryLearningRule[],
  storeName: string,
  category: ReceiptCategory,
): CategoryLearningRule[] {
  if (!storeName.trim()) return rules;
  if (!RECEIPT_CATEGORIES.includes(category)) return rules;
  const key = storeKey(storeName);
  const now = new Date().toISOString();
  const existing = rules.find((rule) => rule.storeKey === key);
  if (!existing) {
    return [
      { storeKey: key, category, hitCount: 1, updatedAt: now },
      ...rules,
    ].slice(0, 200);
  }
  return rules.map((rule) =>
    rule.storeKey === key
      ? {
          ...rule,
          category,
          hitCount: rule.hitCount + 1,
          updatedAt: now,
        }
      : rule,
  );
}
