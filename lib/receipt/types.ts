export const RECEIPT_CATEGORIES = [
  "食費",
  "日用品",
  "交通費",
  "医療",
  "交際費",
  "趣味",
  "仕事",
  "経費",
  "光熱費",
  "その他",
] as const;

export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

export type MoneyUse = "personal" | "business" | "unknown";

export type ReceiptLineItem = {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  tax: number | null;
  taxRate: number | null;
  amountInclTax: number | null;
  confidence: number;
};

export type ReceiptAiFailureCode =
  | "config_missing"
  | "provider_error"
  | "unreadable"
  | "parse_failed"
  | "not_receipt"
  | "openai_unavailable";

export type ReceiptSchema = {
  storeName: string | null;
  phone: string | null;
  address: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:mm
  items: ReceiptLineItem[];
  subtotal: number | null;
  taxTotal: number | null;
  total: number | null;
  paymentMethod: string | null;
  points: string | null;
  registerNo: string | null;
  staff: string | null;
  cardType: string | null;
  /** Safe diagnostic note only — never API keys or provider raw bodies. */
  rawNotes: string | null;
  overallConfidence: number;
  fieldConfidence: Record<string, number>;
  visionSucceeded: boolean;
  model?: string;
  sourceImageIds: string[];
  /** Set when visionSucceeded is false (P0-01 fail-closed). */
  failureCode?: ReceiptAiFailureCode;
  /** Whether the client may usefully retry the same request. */
  retryable?: boolean;
};

export type LowConfidenceField = {
  field: string;
  label: string;
  currentValue: string | null;
  confidence: number;
  candidates: string[];
};

export type LedgerEntry = {
  id: string;
  userId: string;
  receiptId: string;
  date: string;
  storeName: string;
  category: ReceiptCategory;
  itemName: string;
  quantity: number;
  unitPrice: number;
  tax: number;
  amountInclTax: number;
  paymentMethod: string;
  note: string;
  moneyUse: MoneyUse;
  sourceImageIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CategoryLearningRule = {
  storeKey: string;
  category: ReceiptCategory;
  hitCount: number;
  updatedAt: string;
};

export type ReceiptSession = {
  id: string;
  userId: string;
  status:
    | "extracting"
    | "needs_confirmation"
    | "awaiting_expense_choice"
    | "ready"
    | "registered"
    | "failed";
  schemas: ReceiptSchema[];
  pendingFields: LowConfidenceField[];
  suggestedCategory: ReceiptCategory;
  moneyUseGuess: MoneyUse;
  askExpenseConfirmation: boolean;
  entriesPreview: Omit<LedgerEntry, "id" | "createdAt" | "updatedAt">[];
  suggestions: string[];
  /** User-safe message when status is failed. */
  error: string | null;
  /** Machine-readable failure (P0-01). */
  errorCode?: ReceiptAiFailureCode | null;
  /** True when retrying the same request may succeed. */
  retryable?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyAnalytics = {
  yearMonth: string;
  totalSpend: number;
  byCategory: Array<{ category: ReceiptCategory; amount: number; share: number }>;
  previousTotal: number | null;
  deltaAmount: number | null;
  deltaPercent: number | null;
  aiComment: string;
  suggestions: string[];
};

export type HouseholdLedgerState = {
  entries: LedgerEntry[];
  categoryRules: CategoryLearningRule[];
  sessions: ReceiptSession[];
};
