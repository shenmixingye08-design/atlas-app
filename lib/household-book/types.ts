/**
 * Household book (家計簿) product model.
 * Built from existing Vision SoT — not a second Vision engine.
 * Amounts/dates that cannot be read stay null + warning. Never invented.
 */

export const HOUSEHOLD_CATEGORIES = [
  "食費",
  "日用品",
  "交通費",
  "医療費",
  "娯楽",
  "衣服",
  "美容",
  "通信費",
  "光熱費",
  "住居費",
  "教育",
  "仕事",
  "その他",
] as const;

export type HouseholdCategory = (typeof HOUSEHOLD_CATEGORIES)[number];

/** Unclassified when the program is not confident. Not a confirmed その他. */
export type HouseholdCategoryOrOpen = HouseholdCategory | "未分類";

export const DEFAULT_HOUSEHOLD_COLUMNS = [
  "日付",
  "店舗",
  "カテゴリ",
  "商品名",
  "数量",
  "単価",
  "金額",
  "支払方法",
  "メモ",
] as const;

export type HouseholdColumn = (typeof DEFAULT_HOUSEHOLD_COLUMNS)[number];

export type HouseholdWarningCode =
  | "not_a_receipt"
  | "unreadable_total"
  | "unreadable_date"
  | "unreadable_amount"
  | "unreadable_item"
  | "unreadable_store"
  | "partial_items"
  | "vision_failed"
  | "corrupt_image"
  | "double_count_prevented"
  | "item_total_mismatch"
  | "uncertain_category";

export type HouseholdWarning = {
  code: HouseholdWarningCode;
  message: string;
  attachmentId: string | null;
  field?: string;
};

export type HouseholdLine = {
  receiptKey: string;
  purchaseDate: string | null;
  storeName: string | null;
  itemName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  paymentMethod: string | null;
  category: HouseholdCategoryOrOpen;
  categoryConfident: boolean;
  memo: string | null;
  attachmentId: string | null;
  confidence: number;
  warnings: HouseholdWarning[];
};

export type HouseholdReceipt = {
  receiptKey: string;
  kind: "pages" | "receipt_sides" | "separate_documents" | "site_photos" | "mixed";
  attachmentIds: string[];
  purchaseDate: string | null;
  storeName: string | null;
  items: HouseholdLine[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  paymentMethod: string | null;
  confidence: number;
  warnings: HouseholdWarning[];
};

export type HouseholdBookCompleteness = "complete" | "partial" | "blocked";

export type HouseholdBookDocument = {
  id: string;
  sourceBatchId: string;
  yearMonth: string | null;
  receipts: HouseholdReceipt[];
  lines: HouseholdLine[];
  warnings: HouseholdWarning[];
  userMessages: string[];
  completeness: HouseholdBookCompleteness;
  /** True only when every persisted receipt has a readable date + amount and is a receipt. */
  appendable: boolean;
  receiptCount: number;
  totalSpend: number | null;
};

export type HouseholdPreferences = {
  storeCategories: Record<string, HouseholdCategory>;
  preferredCategories: HouseholdCategory[];
  columnOrder: HouseholdColumn[];
  monthStartDay: number;
  aggregation: "category" | "store" | "day";
};

export const DEFAULT_HOUSEHOLD_PREFERENCES: HouseholdPreferences = {
  storeCategories: {},
  preferredCategories: [],
  columnOrder: [...DEFAULT_HOUSEHOLD_COLUMNS],
  monthStartDay: 1,
  aggregation: "category",
};

export type HouseholdCategoryResult = {
  category: HouseholdCategoryOrOpen;
  confident: boolean;
  reason: "memory" | "keyword" | "fallback";
};
