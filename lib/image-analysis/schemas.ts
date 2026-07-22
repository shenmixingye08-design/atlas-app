import { z } from "zod";

import type { ImageDocumentType, ImageAnalysisResult } from "./types";

const nullableString = z.union([z.string(), z.null()]).optional();
const nullableNumber = z.union([z.number(), z.null()]).optional();

const sourceFileSchema = z.object({
  sourceFileId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  pageIndex: z.number().int().nonnegative(),
  status: z.enum(["ok", "failed"]),
  error: z.string().optional(),
});

const baseSchema = z.object({
  documentType: z.enum([
    "table",
    "receipt",
    "invoice",
    "estimate",
    "handwritten",
    "business_card",
    "unknown",
  ]),
  title: z.string().min(1),
  warnings: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  requiresReview: z.boolean(),
  sourceFileId: z.union([z.string(), z.null()]).default(null),
  sourceFiles: z.array(sourceFileSchema).default([]),
  createdAt: z.string().min(1),
});

export const tableAnalysisSchema = baseSchema.extend({
  documentType: z.literal("table"),
  fields: z.object({
    columns: z.array(z.string()).min(1),
    notes: z.string().optional(),
  }),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
});

export const receiptAnalysisSchema = baseSchema.extend({
  documentType: z.literal("receipt"),
  fields: z.object({
    purchaseDate: z.union([z.string(), z.null()]),
    purchaseTime: z.union([z.string(), z.null()]),
    storeName: z.union([z.string(), z.null()]),
    storeAddress: z.union([z.string(), z.null()]),
    taxAmount: z.union([z.number(), z.null()]),
    totalAmount: z.union([z.number(), z.null()]),
    paymentMethod: z.union([z.string(), z.null()]),
    currency: z.string().optional(),
  }),
  rows: z.array(
    z.object({
      name: z.string(),
      quantity: z.union([z.number(), z.null()]),
      unitPrice: z.union([z.number(), z.null()]),
      subtotal: z.union([z.number(), z.null()]),
      discount: z.union([z.number(), z.null()]),
      taxRate: z.union([z.number(), z.null()]),
      category: z.string(),
      note: z.string().optional(),
    }),
  ),
});

export const invoiceAnalysisSchema = baseSchema.extend({
  documentType: z.enum(["invoice", "estimate"]),
  fields: z.object({
    documentKind: z.enum(["invoice", "estimate"]),
    issueDate: z.union([z.string(), z.null()]),
    billingDate: z.union([z.string(), z.null()]),
    dueDate: z.union([z.string(), z.null()]),
    documentNumber: z.union([z.string(), z.null()]),
    issuerName: z.union([z.string(), z.null()]),
    recipientName: z.union([z.string(), z.null()]),
    postalCode: z.union([z.string(), z.null()]),
    address: z.union([z.string(), z.null()]),
    phone: z.union([z.string(), z.null()]),
    email: z.union([z.string(), z.null()]),
    subtotal: z.union([z.number(), z.null()]),
    taxAmount: z.union([z.number(), z.null()]),
    totalAmount: z.union([z.number(), z.null()]),
    bankAccount: z.union([z.string(), z.null()]),
    notes: z.union([z.string(), z.null()]),
  }),
  rows: z.array(
    z.object({
      name: z.string(),
      quantity: z.union([z.number(), z.null()]),
      unitPrice: z.union([z.number(), z.null()]),
      amount: z.union([z.number(), z.null()]),
      note: z.string().optional(),
    }),
  ),
});

export const handwrittenAnalysisSchema = baseSchema.extend({
  documentType: z.literal("handwritten"),
  fields: z.object({
    transcript: z.string(),
    cleanedText: z.string(),
    unclearSpans: z.array(z.string()).default([]),
  }),
  rows: z.array(
    z.object({
      title: z.string(),
      assignee: z.union([z.string(), z.null()]),
      dueDate: z.union([z.string(), z.null()]),
      priority: z
        .union([
          z.enum(["high", "medium", "low", "要確認"]),
          z.null(),
        ])
        .optional()
        .transform((v) => v ?? null),
      note: z.string().optional(),
    }),
  ),
});

export const businessCardAnalysisSchema = baseSchema.extend({
  documentType: z.literal("business_card"),
  fields: z.object({
    contacts: z.array(
      z.object({
        fullName: z.union([z.string(), z.null()]),
        fullNameKana: z.union([z.string(), z.null()]),
        company: z.union([z.string(), z.null()]),
        department: z.union([z.string(), z.null()]),
        title: z.union([z.string(), z.null()]),
        postalCode: z.union([z.string(), z.null()]),
        address: z.union([z.string(), z.null()]),
        phone: z.union([z.string(), z.null()]),
        mobile: z.union([z.string(), z.null()]),
        fax: z.union([z.string(), z.null()]),
        email: z.union([z.string(), z.null()]),
        website: z.union([z.string(), z.null()]),
        sns: z.union([z.string(), z.null()]),
        note: z.string().optional(),
        sourceFileId: z.union([z.string(), z.null()]),
      }),
    ),
  }),
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const imageAnalysisSchema = z.discriminatedUnion("documentType", [
  tableAnalysisSchema,
  receiptAnalysisSchema,
  invoiceAnalysisSchema,
  handwrittenAnalysisSchema,
  businessCardAnalysisSchema,
  baseSchema.extend({
    documentType: z.literal("unknown"),
    fields: z.record(z.string(), z.unknown()).default({}),
    rows: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
]);

export type ParsedImageAnalysis = z.infer<typeof imageAnalysisSchema>;

export function schemaForDocumentType(type: ImageDocumentType) {
  switch (type) {
    case "table":
      return tableAnalysisSchema;
    case "receipt":
      return receiptAnalysisSchema;
    case "invoice":
    case "estimate":
      return invoiceAnalysisSchema;
    case "handwritten":
      return handwrittenAnalysisSchema;
    case "business_card":
      return businessCardAnalysisSchema;
    default:
      return imageAnalysisSchema;
  }
}

export function parseImageAnalysisJson(
  value: unknown,
):
  | { ok: true; data: ImageAnalysisResult }
  | { ok: false; error: string } {
  const parsed = imageAnalysisSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }

  const data = parsed.data as ImageAnalysisResult;
  if (data.documentType === "business_card") {
    const contacts = data.fields.contacts ?? [];
    return {
      ok: true,
      data: {
        ...data,
        rows: contacts,
      },
    };
  }

  return { ok: true, data };
}

/** Soft helpers used by repair prompts — keep unused imports honest for tree-shaking. */
void nullableString;
void nullableNumber;
