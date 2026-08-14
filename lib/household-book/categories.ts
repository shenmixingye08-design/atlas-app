import {
  HOUSEHOLD_CATEGORIES,
  type HouseholdCategory,
  type HouseholdCategoryOrOpen,
  type HouseholdCategoryResult,
  type HouseholdPreferences,
} from "@/lib/household-book/types";

export function storeCategoryKey(storeName: string): string {
  return storeName.replace(/\s+/g, "").toLowerCase();
}

const KEYWORD_RULES: Array<{
  pattern: RegExp;
  category: HouseholdCategory;
}> = [
  {
    pattern: /病院|薬局|ドラッグ|医療|クリニック|処方箋|通院/,
    category: "医療費",
  },
  {
    pattern: /電車|バス|タクシー|suica|パスモ|pasmo|ガソリン|駐車|jr\b|交通/i,
    category: "交通費",
  },
  { pattern: /電気|ガス|水道/, category: "光熱費" },
  { pattern: /ドコモ|ソフトバンク|通信費|スマホ代|携帯代|\bau\b/, category: "通信費" },
  { pattern: /家賃|住宅|管理費|住居/, category: "住居費" },
  { pattern: /塾|学費|教材|学校|教育/, category: "教育" },
  { pattern: /ユニクロ|衣料|洋服|靴|衣服/, category: "衣服" },
  { pattern: /美容|化粧品|ヘアサロン|理容/, category: "美容" },
  {
    pattern: /ゲーム|映画|趣味|エンタメ|娯楽|カラオケ/,
    category: "娯楽",
  },
  {
    pattern: /ホームセンター|ダイソー|セリア|日用品|洗剤|ティッシュ/,
    category: "日用品",
  },
  {
    pattern: /オフィス|文具|cop[yi]|名刺|仕事/,
    category: "仕事",
  },
  {
    pattern:
      /居酒屋|レストラン|カフェ|弁当|コンビニ|スーパー|食品|食料|お茶|飲料|パン|野菜|肉|魚|ご飯|ランチ/,
    category: "食費",
  },
];

const CONVENIENCE_FOOD = /ローソン|セブン|ファミマ|ファミリーマート|ミニストップ|デイリーヤマザキ/;

function matches(hay: string, pattern: RegExp): boolean {
  return pattern.test(hay);
}

export function classifyHouseholdCategory(input: {
  storeName: string | null;
  itemName: string | null;
  visionCategory?: string | null;
  preferences?: HouseholdPreferences | null;
}): HouseholdCategoryResult {
  const store = input.storeName?.trim() ?? "";
  const item = input.itemName?.trim() ?? "";

  if (store && input.preferences) {
    const learned = input.preferences.storeCategories[storeCategoryKey(store)];
    if (learned && HOUSEHOLD_CATEGORIES.includes(learned)) {
      return { category: learned, confident: true, reason: "memory" };
    }
  }

  const hay = `${store} ${item}`.trim();
  const hits = KEYWORD_RULES.filter((rule) => matches(hay, rule.pattern));
  const unique = [...new Set(hits.map((rule) => rule.category))];
  if (unique.length === 1) {
    return { category: unique[0]!, confident: true, reason: "keyword" };
  }
  if (unique.length > 1) {
    return { category: "その他", confident: false, reason: "fallback" };
  }

  if (store && CONVENIENCE_FOOD.test(store) && !item) {
    return { category: "食費", confident: true, reason: "keyword" };
  }

  const mapped = mapVisionCategory(input.visionCategory);
  if (mapped) {
    return { category: mapped, confident: false, reason: "fallback" };
  }

  return { category: "その他", confident: false, reason: "fallback" };
}

function mapVisionCategory(raw: string | null | undefined): HouseholdCategoryOrOpen | null {
  if (!raw) return null;
  const text = raw.trim();
  if ((HOUSEHOLD_CATEGORIES as readonly string[]).includes(text)) {
    return text as HouseholdCategory;
  }
  if (text === "未分類") return "未分類";
  if (/医療/.test(text)) return "医療費";
  if (/趣味|娯楽/.test(text)) return "娯楽";
  if (/食|飲料|食料/.test(text)) return "食費";
  if (/日用/.test(text)) return "日用品";
  if (/交通/.test(text)) return "交通費";
  if (/光熱/.test(text)) return "光熱費";
  if (/通信/.test(text)) return "通信費";
  if (/住居|家賃/.test(text)) return "住居費";
  if (/教育/.test(text)) return "教育";
  if (/衣服|衣料/.test(text)) return "衣服";
  if (/美容/.test(text)) return "美容";
  if (/仕事|経費/.test(text)) return "仕事";
  return null;
}

export function isStandardHouseholdCategory(
  value: string,
): value is HouseholdCategory {
  return (HOUSEHOLD_CATEGORIES as readonly string[]).includes(value);
}
