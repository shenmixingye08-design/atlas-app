import "server-only";

import { randomUUID } from "crypto";

import type { MediaImageInput } from "@/lib/media-pipelines";
import {
  classifyAndRouteMedia,
} from "@/lib/media-pipelines";

import { buildMonthlyAnalytics } from "./analytics";
import { guessMoneyUse } from "./business";
import {
  learnCategoryCorrection,
  suggestCategory,
} from "./categorize";
import {
  applyFieldAnswers,
  collectLowConfidenceFields,
} from "./confidence";
import {
  failureNotReceipt,
  RECEIPT_USER_ERROR,
  type ReceiptAiFailure,
} from "./errors";
import { extractReceiptSchemas } from "./extract";
import { buildReceiptSuggestions } from "./suggestions";
import {
  getReceiptSession,
  listCategoryRules,
  listLedgerEntries,
  saveReceiptSession,
  upsertLedgerEntries,
  replaceCategoryRules,
} from "./store";
import { schedulePersistHouseholdLedger } from "./durable";
import type {
  LedgerEntry,
  MoneyUse,
  ReceiptCategory,
  ReceiptSchema,
  ReceiptSession,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function buildPreviewEntries(input: {
  userId: string;
  receiptId: string;
  schemas: ReceiptSchema[];
  category: ReceiptCategory;
  moneyUse: MoneyUse;
}): Omit<LedgerEntry, "id" | "createdAt" | "updatedAt">[] {
  const rows: Omit<LedgerEntry, "id" | "createdAt" | "updatedAt">[] = [];
  for (const schema of input.schemas) {
    const date = schema.date ?? nowIso().slice(0, 10);
    const store = schema.storeName ?? "不明な店舗";
    const payment = schema.paymentMethod ?? "不明";
    if (schema.items.length === 0) {
      rows.push({
        userId: input.userId,
        receiptId: input.receiptId,
        date,
        storeName: store,
        category: input.category,
        itemName: "合計",
        quantity: 1,
        unitPrice: schema.total ?? 0,
        tax: schema.taxTotal ?? 0,
        amountInclTax: schema.total ?? 0,
        paymentMethod: payment,
        note: schema.time ? `時刻 ${schema.time}` : "",
        moneyUse: input.moneyUse,
        sourceImageIds: schema.sourceImageIds,
      });
      continue;
    }
    for (const item of schema.items) {
      const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
      const amount =
        item.amountInclTax ??
        (item.unitPrice != null ? item.unitPrice * qty : 0);
      rows.push({
        userId: input.userId,
        receiptId: input.receiptId,
        date,
        storeName: store,
        category: input.category,
        itemName: item.name,
        quantity: qty,
        unitPrice: item.unitPrice ?? amount,
        tax: item.tax ?? 0,
        amountInclTax: amount,
        paymentMethod: payment,
        note: [
          schema.time ? `時刻 ${schema.time}` : null,
          item.taxRate != null ? `税率 ${Math.round(item.taxRate * 100)}%` : null,
        ]
          .filter(Boolean)
          .join(" / "),
        moneyUse: input.moneyUse,
        sourceImageIds: schema.sourceImageIds,
      });
    }
  }
  return rows;
}

export type ProcessReceiptInput = {
  userId: string;
  images: MediaImageInput[];
  userHint?: string;
  companyHint?: string | null;
  hasBusinessContext?: boolean;
};

function resolveExtractFailure(schemas: ReceiptSchema[]): ReceiptAiFailure {
  const first = schemas.find((schema) => !schema.visionSucceeded);
  if (!first?.failureCode) {
    return {
      code: "unreadable",
      userMessage: RECEIPT_USER_ERROR.analysisFailed,
      retryable: false,
    };
  }
  return {
    code: first.failureCode,
    userMessage: first.rawNotes ?? RECEIPT_USER_ERROR.analysisFailed,
    retryable: Boolean(first.retryable),
  };
}

function buildFailedSession(input: {
  sessionId: string;
  userId: string;
  createdAt: string;
  schemas: ReceiptSchema[];
  failure: ReceiptAiFailure;
}): ReceiptSession {
  return {
    id: input.sessionId,
    userId: input.userId,
    status: "failed",
    schemas: input.schemas,
    pendingFields: [],
    suggestedCategory: "その他",
    moneyUseGuess: "unknown",
    askExpenseConfirmation: false,
    entriesPreview: [],
    suggestions: [],
    error: input.failure.userMessage,
    errorCode: input.failure.code,
    retryable: input.failure.retryable,
    createdAt: input.createdAt,
    updatedAt: nowIso(),
  };
}

/**
 * Receipt Pipeline:
 * images → classify → extract → confidence → preview ledger (not registered until confirm)
 *
 * P0-01: AI failure never auto-registers ledger entries or invents totals.
 */
export async function runReceiptPipeline(
  input: ProcessReceiptInput,
): Promise<ReceiptSession> {
  const createdAt = nowIso();
  const sessionId = randomUUID();

  // Classify first image; all must be receipt to proceed as batch.
  for (const image of input.images) {
    const route = await classifyAndRouteMedia(image, {
      userHint: input.userHint,
    });
    if (route.pipelineId !== "receipt") {
      const failure =
        route.classification.reason === "openai_unavailable" ||
        route.classification.reason === "openai_error"
          ? {
              code: "openai_unavailable" as const,
              userMessage: RECEIPT_USER_ERROR.analysisFailed,
              retryable: route.classification.reason === "openai_error",
            }
          : failureNotReceipt(route.classification.kind);
      const failed = buildFailedSession({
        sessionId,
        userId: input.userId,
        createdAt,
        schemas: [],
        failure,
      });
      saveReceiptSession(input.userId, failed);
      schedulePersistHouseholdLedger(input.userId);
      return failed;
    }
  }

  const schemas = await extractReceiptSchemas(input.images);
  const anySuccess = schemas.some((schema) => schema.visionSucceeded);
  if (!anySuccess) {
    const failed = buildFailedSession({
      sessionId,
      userId: input.userId,
      createdAt,
      schemas,
      failure: resolveExtractFailure(schemas),
    });
    saveReceiptSession(input.userId, failed);
    schedulePersistHouseholdLedger(input.userId);
    return failed;
  }

  const succeeded = schemas.filter((schema) => schema.visionSucceeded);
  const rules = listCategoryRules(input.userId);
  const category = suggestCategory(succeeded[0]!, rules);
  const business = guessMoneyUse({
    schemas: succeeded,
    companyHint: input.companyHint,
    hasBusinessContext: input.hasBusinessContext,
  });
  const pendingFields = collectLowConfidenceFields(succeeded);
  const preview = buildPreviewEntries({
    userId: input.userId,
    receiptId: sessionId,
    schemas: succeeded,
    category,
    moneyUse: business.moneyUse,
  });
  const existingEntries = await listLedgerEntries(input.userId);
  const suggestions = buildReceiptSuggestions({
    schemas: succeeded,
    entries: existingEntries,
    newEntries: preview,
  });

  let status: ReceiptSession["status"] = "ready";
  if (pendingFields.length > 0) status = "needs_confirmation";
  else if (business.askExpenseConfirmation) status = "awaiting_expense_choice";

  // High confidence + personal: auto-register (reduce clicks).
  if (status === "ready") {
    const now = nowIso();
    const entries: LedgerEntry[] = preview.map((row) => ({
      ...row,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    }));
    await upsertLedgerEntries(input.userId, entries);
    const session: ReceiptSession = {
      id: sessionId,
      userId: input.userId,
      status: "registered",
      schemas: succeeded,
      pendingFields: [],
      suggestedCategory: category,
      moneyUseGuess: business.moneyUse,
      askExpenseConfirmation: false,
      entriesPreview: preview,
      suggestions,
      error: null,
      createdAt,
      updatedAt: now,
    };
    saveReceiptSession(input.userId, session);
    schedulePersistHouseholdLedger(input.userId);
    return session;
  }

  const session: ReceiptSession = {
    id: sessionId,
    userId: input.userId,
    status,
    schemas: succeeded,
    pendingFields,
    suggestedCategory: category,
    moneyUseGuess: business.moneyUse,
    askExpenseConfirmation: business.askExpenseConfirmation,
    entriesPreview: preview,
    suggestions,
    error: null,
    createdAt,
    updatedAt: nowIso(),
  };
  saveReceiptSession(input.userId, session);
  schedulePersistHouseholdLedger(input.userId);
  return session;
}

export type ConfirmReceiptInput = {
  userId: string;
  sessionId: string;
  fieldAnswers?: Record<string, string>;
  category?: ReceiptCategory;
  moneyUse?: MoneyUse;
  registerAsExpense?: boolean;
};

export async function confirmAndRegisterReceipt(
  input: ConfirmReceiptInput,
): Promise<ReceiptSession> {
  const session = getReceiptSession(input.userId, input.sessionId);
  if (!session) {
    throw new Error("セッションが見つかりません");
  }
  if (session.status === "failed") {
    throw new Error(session.error ?? "このセッションは失敗しています");
  }
  if (session.status === "registered") return session;

  let schemas = session.schemas;
  if (input.fieldAnswers && Object.keys(input.fieldAnswers).length > 0) {
    schemas = applyFieldAnswers(schemas, input.fieldAnswers);
  }

  const answered = new Set(Object.keys(input.fieldAnswers ?? {}));
  const stillPending = collectLowConfidenceFields(schemas).filter(
    (field) => !answered.has(field.field),
  );
  if (stillPending.length > 0) {
    const next: ReceiptSession = {
      ...session,
      schemas,
      pendingFields: stillPending,
      status: "needs_confirmation",
      updatedAt: nowIso(),
    };
    saveReceiptSession(input.userId, next);
    schedulePersistHouseholdLedger(input.userId);
    return next;
  }

  let moneyUse = input.moneyUse ?? session.moneyUseGuess;
  if (session.askExpenseConfirmation || session.status === "awaiting_expense_choice") {
    if (input.registerAsExpense === true) moneyUse = "business";
    else if (input.registerAsExpense === false) moneyUse = "personal";
    else if (input.moneyUse == null && input.registerAsExpense == null) {
      const next: ReceiptSession = {
        ...session,
        schemas,
        pendingFields: [],
        status: "awaiting_expense_choice",
        askExpenseConfirmation: true,
        updatedAt: nowIso(),
      };
      saveReceiptSession(input.userId, next);
      schedulePersistHouseholdLedger(input.userId);
      return next;
    }
  }

  const category = input.category ?? session.suggestedCategory;
  if (input.category && schemas[0]?.storeName) {
    const rules = learnCategoryCorrection(
      listCategoryRules(input.userId),
      schemas[0].storeName,
      input.category,
    );
    replaceCategoryRules(input.userId, rules);
  }

  const preview = buildPreviewEntries({
    userId: input.userId,
    receiptId: session.id,
    schemas,
    category,
    moneyUse,
  });

  const now = nowIso();
  const entries: LedgerEntry[] = preview.map((row) => ({
    ...row,
    id: randomUUID(),
    category,
    moneyUse,
    createdAt: now,
    updatedAt: now,
  }));
  await upsertLedgerEntries(input.userId, entries);

  const registered: ReceiptSession = {
    ...session,
    schemas,
    pendingFields: [],
    suggestedCategory: category,
    moneyUseGuess: moneyUse,
    askExpenseConfirmation: false,
    entriesPreview: preview,
    status: "registered",
    updatedAt: now,
    error: null,
  };
  saveReceiptSession(input.userId, registered);
  schedulePersistHouseholdLedger(input.userId);
  return registered;
}

export async function getLedgerAnalytics(userId: string, yearMonth: string) {
  const entries = await listLedgerEntries(userId);
  return buildMonthlyAnalytics(entries, yearMonth);
}
