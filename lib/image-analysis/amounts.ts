import { AMOUNT_MISMATCH_WARNING } from "./types";
import type { ImageAnalysisResult, InvoiceImageAnalysis, ReceiptImageAnalysis } from "./types";

const EPSILON = 1;

function sumNumbers(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return acc + value;
    }
    return acc;
  }, 0);
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

export function validateReceiptAmounts(
  analysis: ReceiptImageAnalysis,
): string[] {
  const warnings: string[] = [];
  const lineSum = sumNumbers(
    analysis.rows.map((row) =>
      typeof row.subtotal === "number" ? row.subtotal : null,
    ),
  );
  const discounts = sumNumbers(
    analysis.rows.map((row) =>
      typeof row.discount === "number" ? row.discount : null,
    ),
  );
  const expected = lineSum - discounts;
  const total = analysis.fields.totalAmount;

  if (
    typeof total === "number" &&
    analysis.rows.length > 0 &&
    !nearlyEqual(expected, total)
  ) {
    warnings.push(AMOUNT_MISMATCH_WARNING);
  }

  return warnings;
}

export function validateInvoiceAmounts(
  analysis: InvoiceImageAnalysis,
): string[] {
  const warnings: string[] = [];
  const lineSum = sumNumbers(
    analysis.rows.map((row) =>
      typeof row.amount === "number" ? row.amount : null,
    ),
  );
  const subtotal = analysis.fields.subtotal;
  const tax = analysis.fields.taxAmount;
  const total = analysis.fields.totalAmount;

  if (
    typeof subtotal === "number" &&
    analysis.rows.length > 0 &&
    !nearlyEqual(lineSum, subtotal)
  ) {
    warnings.push(AMOUNT_MISMATCH_WARNING);
  }

  if (
    typeof subtotal === "number" &&
    typeof tax === "number" &&
    typeof total === "number" &&
    !nearlyEqual(subtotal + tax, total)
  ) {
    warnings.push(AMOUNT_MISMATCH_WARNING);
  }

  return warnings;
}

/** Attach amount-consistency warnings without mutating AI numbers. */
export function applyAmountValidation(
  analysis: ImageAnalysisResult,
): ImageAnalysisResult {
  if (analysis.documentType === "receipt") {
    const extra = validateReceiptAmounts(analysis);
    if (extra.length === 0) return analysis;
    return {
      ...analysis,
      warnings: [...analysis.warnings, ...extra],
      requiresReview: true,
    };
  }

  if (analysis.documentType === "invoice" || analysis.documentType === "estimate") {
    const extra = validateInvoiceAmounts(analysis);
    if (extra.length === 0) return analysis;
    return {
      ...analysis,
      warnings: [...analysis.warnings, ...extra],
      requiresReview: true,
    };
  }

  return analysis;
}
