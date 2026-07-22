import "server-only";

import type { ResponseInputContent } from "openai/resources/responses/responses";

import { buildInputImageParts } from "@/lib/attachments/to-response-input";
import {
  readAvailableImageAttachments,
  readAttachmentsFromMetadata,
  isImageAttachment,
} from "@/lib/attachments/metadata";
import { createAtlasResponse } from "@/lib/openai";
import { isMockLlmEnabled } from "@/lib/ai/mock-responses";

import { applyAmountValidation } from "./amounts";
import {
  buildExtractionInstructions,
  buildExtractionUserPrompt,
  buildRepairPrompt,
} from "./prompts";
import { parseImageAnalysisJson } from "./schemas";
import type {
  ImageAnalysisResult,
  ImageAnalysisSourceFile,
  ImageDocumentType,
} from "./types";
import {
  IMAGE_ANALYSIS_FAILED_USER_MESSAGE,
  IMAGE_FETCH_FAILED_USER_MESSAGE,
} from "./types";

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty model output");

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim()) as unknown;
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    throw new Error("model output is not JSON");
  }
}

function buildSourceFiles(
  metadata: Readonly<Record<string, unknown>> | undefined,
): ImageAnalysisSourceFile[] {
  const all = readAttachmentsFromMetadata(metadata).filter(isImageAttachment);
  return all.map((item, index) => {
    const failed = item.fetchFailed || !item.contentAvailable || !item.storageId;
    return {
      sourceFileId: item.storageId ?? `missing-${index}`,
      fileName: item.name,
      mimeType: item.mimeType ?? "application/octet-stream",
      pageIndex: index,
      status: failed ? "failed" : "ok",
      ...(failed
        ? { error: IMAGE_FETCH_FAILED_USER_MESSAGE }
        : {}),
    };
  });
}

function withSourceDefaults(
  data: ImageAnalysisResult,
  sourceFiles: ImageAnalysisSourceFile[],
  documentType: ImageDocumentType,
): ImageAnalysisResult {
  const firstOk = sourceFiles.find((file) => file.status === "ok");
  return {
    ...data,
    documentType: data.documentType || documentType,
    sourceFileId: data.sourceFileId ?? firstOk?.sourceFileId ?? null,
    sourceFiles: data.sourceFiles?.length ? data.sourceFiles : sourceFiles,
    createdAt: data.createdAt || new Date().toISOString(),
  } as ImageAnalysisResult;
}

function buildMockAnalysis(
  documentType: ImageDocumentType,
  sourceFiles: ImageAnalysisSourceFile[],
): ImageAnalysisResult {
  const now = new Date().toISOString();
  const sourceFileId = sourceFiles.find((f) => f.status === "ok")?.sourceFileId ?? null;

  if (documentType === "receipt") {
    return {
      documentType: "receipt",
      title: "レシート（モック）",
      confidence: 0.9,
      requiresReview: false,
      sourceFileId,
      sourceFiles,
      createdAt: now,
      warnings: [],
      fields: {
        purchaseDate: "2026-07-22",
        purchaseTime: "12:34",
        storeName: "サンプル商店",
        storeAddress: null,
        taxAmount: 80,
        totalAmount: 1080,
        paymentMethod: "現金",
      },
      rows: [
        {
          name: "お茶",
          quantity: 1,
          unitPrice: 1000,
          subtotal: 1000,
          discount: 0,
          taxRate: 0.08,
          category: "食費",
        },
      ],
    };
  }

  if (documentType === "business_card") {
    const contact = {
      fullName: "山田 太郎",
      fullNameKana: "ヤマダ タロウ",
      company: "株式会社サンプル",
      department: "営業部",
      title: "主任",
      postalCode: null,
      address: null,
      phone: "03-1234-5678",
      mobile: null,
      fax: null,
      email: "taro@example.com",
      website: null,
      sns: null,
      sourceFileId,
    };
    return {
      documentType: "business_card",
      title: "名刺（モック）",
      confidence: 0.9,
      requiresReview: false,
      sourceFileId,
      sourceFiles,
      createdAt: now,
      warnings: [],
      fields: { contacts: [contact] },
      rows: [contact],
    };
  }

  if (documentType === "handwritten") {
    return {
      documentType: "handwritten",
      title: "手書きメモ（モック）",
      confidence: 0.85,
      requiresReview: false,
      sourceFileId,
      sourceFiles,
      createdAt: now,
      warnings: [],
      fields: {
        transcript: "明日までに見積を送る",
        cleanedText: "明日までに見積を送る。",
        unclearSpans: [],
      },
      rows: [
        {
          title: "見積を送る",
          assignee: null,
          dueDate: null,
          priority: "medium",
        },
      ],
    };
  }

  if (documentType === "invoice" || documentType === "estimate") {
    return {
      documentType,
      title: documentType === "estimate" ? "見積書（モック）" : "請求書（モック）",
      confidence: 0.9,
      requiresReview: false,
      sourceFileId,
      sourceFiles,
      createdAt: now,
      warnings: [],
      fields: {
        documentKind: documentType === "estimate" ? "estimate" : "invoice",
        issueDate: "2026-07-01",
        billingDate: "2026-07-01",
        dueDate: "2026-07-31",
        documentNumber: "INV-001",
        issuerName: "株式会社発行元",
        recipientName: "株式会社宛先",
        postalCode: null,
        address: null,
        phone: null,
        email: null,
        subtotal: 10000,
        taxAmount: 1000,
        totalAmount: 11000,
        bankAccount: null,
        notes: null,
      },
      rows: [
        {
          name: "コンサルティング",
          quantity: 1,
          unitPrice: 10000,
          amount: 10000,
        },
      ],
    };
  }

  return {
    documentType: "table",
    title: "表データ（モック）",
    confidence: 0.9,
    requiresReview: false,
    sourceFileId,
    sourceFiles,
    createdAt: now,
    warnings: [],
    fields: { columns: ["順位", "商品名", "スコア"] },
    rows: [
      { 順位: 1, 商品名: "サンプルA", スコア: 95 },
      { 順位: 2, 商品名: "サンプルB", スコア: 88 },
    ],
  };
}

async function callVisionJson(input: {
  instructions: string;
  text: string;
  metadata: Readonly<Record<string, unknown>> | undefined;
}): Promise<string> {
  const imageParts = buildInputImageParts(input.metadata);
  const content: ResponseInputContent[] = [
    { type: "input_text", text: input.text },
    ...imageParts,
  ];

  const response = await createAtlasResponse({
    input: [
      {
        type: "message",
        role: "user",
        content,
      },
    ],
    instructions: input.instructions,
    aiTaskType: "worker_deliverable",
    temperature: 0.1,
  });

  return response.output_text ?? "";
}

export type AnalyzeAttachedImagesResult =
  | { ok: true; analysis: ImageAnalysisResult }
  | {
      ok: false;
      code: "image_fetch_failed" | "analysis_failed";
      message: string;
    };

/**
 * Analyze attached images into typed structured JSON.
 * Does not invent content when images are unavailable.
 */
export async function analyzeAttachedImages(input: {
  assignment: string;
  documentType: ImageDocumentType;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<AnalyzeAttachedImagesResult> {
  const sourceFiles = buildSourceFiles(input.metadata);
  const available = readAvailableImageAttachments(input.metadata);

  if (available.length === 0 || sourceFiles.every((f) => f.status === "failed")) {
    return {
      ok: false,
      code: "image_fetch_failed",
      message: IMAGE_FETCH_FAILED_USER_MESSAGE,
    };
  }

  if (isMockLlmEnabled()) {
    return {
      ok: true,
      analysis: applyAmountValidation(
        buildMockAnalysis(input.documentType, sourceFiles),
      ),
    };
  }

  const sourceFileIds = available
    .map((item) => item.storageId)
    .filter((id): id is string => Boolean(id));

  const instructions = buildExtractionInstructions(input.documentType);
  const userPrompt = buildExtractionUserPrompt({
    assignment: input.assignment,
    documentType: input.documentType,
    sourceFileIds,
  });

  try {
    const raw = await callVisionJson({
      instructions,
      text: userPrompt,
      metadata: input.metadata,
    });

    let parsedUnknown: unknown;
    try {
      parsedUnknown = extractJsonObject(raw);
    } catch {
      return {
        ok: false,
        code: "analysis_failed",
        message: IMAGE_ANALYSIS_FAILED_USER_MESSAGE,
      };
    }

    let validated = parseImageAnalysisJson(parsedUnknown);
    if (!validated.ok) {
      const repairRaw = await callVisionJson({
        instructions,
        text: buildRepairPrompt({
          documentType: input.documentType,
          invalidJson: raw,
          validationError: validated.error,
        }),
        metadata: input.metadata,
      });

      try {
        parsedUnknown = extractJsonObject(repairRaw);
      } catch {
        return {
          ok: false,
          code: "analysis_failed",
          message: IMAGE_ANALYSIS_FAILED_USER_MESSAGE,
        };
      }

      validated = parseImageAnalysisJson(parsedUnknown);
      if (!validated.ok) {
        return {
          ok: false,
          code: "analysis_failed",
          message: IMAGE_ANALYSIS_FAILED_USER_MESSAGE,
        };
      }
    }

    const withSources = withSourceDefaults(
      validated.data,
      sourceFiles,
      input.documentType,
    );

    return {
      ok: true,
      analysis: applyAmountValidation(withSources),
    };
  } catch (error) {
    console.error("[image-analysis] analyze failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      code: "analysis_failed",
      message: IMAGE_ANALYSIS_FAILED_USER_MESSAGE,
    };
  }
}
