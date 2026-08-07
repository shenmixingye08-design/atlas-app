import "server-only";

import { CHEAP_MODEL } from "@/lib/ai/model-catalog";
import { isMockLlmEnabled } from "@/lib/ai/mock-responses";
import { isOpenAIConfigured, getOpenAIClient } from "@/lib/openai";
import type { MediaImageInput } from "@/lib/media-pipelines";

import {
  failureConfigMissing,
  failureFromProviderError,
  failureParseFailed,
  failureUnreadable,
  type ReceiptAiFailure,
} from "./errors";
import type { ReceiptLineItem, ReceiptSchema } from "./types";

const EXTRACT_PROMPT = `あなたは日本のレシート読取エンジンです。
画像から家計簿用の構造化JSONのみを返してください。説明文やMarkdownは禁止です。

形式:
{
  "visionSucceeded": true,
  "overallConfidence": 0.0-1.0,
  "storeName": string|null,
  "phone": string|null,
  "address": string|null,
  "date": "YYYY-MM-DD"|null,
  "time": "HH:mm"|null,
  "items": [{"name":string,"quantity":number|null,"unitPrice":number|null,"tax":number|null,"taxRate":number|null,"amountInclTax":number|null,"confidence":0-1}],
  "subtotal": number|null,
  "taxTotal": number|null,
  "total": number|null,
  "paymentMethod": string|null,
  "points": string|null,
  "registerNo": string|null,
  "staff": string|null,
  "cardType": string|null,
  "rawNotes": string|null,
  "fieldConfidence": {"storeName":0-1,"date":0-1,"total":0-1,"paymentMethod":0-1,"items":0-1}
}

読めない項目は null。推測で埋めない。レシートでない/読めない場合は visionSucceeded=false。`;

function failedSchema(
  imageIds: string[],
  failure: ReceiptAiFailure,
): ReceiptSchema {
  return {
    storeName: null,
    phone: null,
    address: null,
    date: null,
    time: null,
    items: [],
    subtotal: null,
    taxTotal: null,
    total: null,
    paymentMethod: null,
    points: null,
    registerNo: null,
    staff: null,
    cardType: null,
    rawNotes: failure.userMessage,
    overallConfidence: 0,
    fieldConfidence: {},
    visionSucceeded: false,
    sourceImageIds: imageIds,
    failureCode: failure.code,
    retryable: failure.retryable,
  };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[,円￥\\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeItems(raw: unknown): ReceiptLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) return null;
      return {
        name,
        quantity: asNumber(row.quantity),
        unitPrice: asNumber(row.unitPrice),
        tax: asNumber(row.tax),
        taxRate: asNumber(row.taxRate),
        amountInclTax: asNumber(row.amountInclTax),
        confidence:
          typeof row.confidence === "number" ? row.confidence : 0.5,
      } satisfies ReceiptLineItem;
    })
    .filter((item): item is ReceiptLineItem => item != null);
}

function parseSchema(text: string, imageIds: string[], model?: string): ReceiptSchema {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return failedSchema(imageIds, failureParseFailed());
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const visionSucceeded = parsed.visionSucceeded !== false;
    const items = normalizeItems(parsed.items);
    const total = asNumber(parsed.total);
    const hasSignal =
      Boolean(parsed.storeName) ||
      Boolean(parsed.date) ||
      total != null ||
      items.length > 0;
    if (!visionSucceeded || !hasSignal) {
      return failedSchema(imageIds, failureUnreadable());
    }
    const fieldConfidence =
      parsed.fieldConfidence && typeof parsed.fieldConfidence === "object"
        ? (parsed.fieldConfidence as Record<string, number>)
        : {};
    return {
      storeName:
        typeof parsed.storeName === "string" ? parsed.storeName.trim() : null,
      phone: typeof parsed.phone === "string" ? parsed.phone.trim() : null,
      address:
        typeof parsed.address === "string" ? parsed.address.trim() : null,
      date: typeof parsed.date === "string" ? parsed.date.trim() : null,
      time: typeof parsed.time === "string" ? parsed.time.trim() : null,
      items,
      subtotal: asNumber(parsed.subtotal),
      taxTotal: asNumber(parsed.taxTotal),
      total,
      paymentMethod:
        typeof parsed.paymentMethod === "string"
          ? parsed.paymentMethod.trim()
          : null,
      points: typeof parsed.points === "string" ? parsed.points.trim() : null,
      registerNo:
        typeof parsed.registerNo === "string" ? parsed.registerNo.trim() : null,
      staff: typeof parsed.staff === "string" ? parsed.staff.trim() : null,
      cardType:
        typeof parsed.cardType === "string" ? parsed.cardType.trim() : null,
      rawNotes:
        typeof parsed.rawNotes === "string" ? parsed.rawNotes.trim() : null,
      overallConfidence:
        typeof parsed.overallConfidence === "number"
          ? parsed.overallConfidence
          : 0.6,
      fieldConfidence,
      visionSucceeded: true,
      model,
      sourceImageIds: imageIds,
    };
  } catch {
    return failedSchema(imageIds, failureParseFailed());
  }
}

/**
 * Deterministic mock extract for tests / offline.
 * Must only be reached via isMockLlmEnabled() (non-production + ATLAS_MOCK_LLM=true).
 */
export function mockExtractReceipt(
  image: MediaImageInput,
  index = 0,
): ReceiptSchema {
  const day = String(10 + (index % 18)).padStart(2, "0");
  const stores = ["ローソン", "セブンイレブン", "ファミリーマート"] as const;
  const store = stores[index % stores.length]!;
  return {
    storeName: store,
    phone: "03-1234-5678",
    address: "東京都渋谷区1-2-3",
    date: `2026-07-${day}`,
    time: "12:34",
    items: [
      {
        name: index % 2 === 0 ? "からあげクン" : "お茶",
        quantity: 1,
        unitPrice: index % 2 === 0 ? 250 : 140,
        tax: index % 2 === 0 ? 20 : 11,
        taxRate: 0.08,
        amountInclTax: index % 2 === 0 ? 270 : 151,
        confidence: 0.9,
      },
    ],
    subtotal: index % 2 === 0 ? 250 : 140,
    taxTotal: index % 2 === 0 ? 20 : 11,
    total: index % 2 === 0 ? 270 : 151,
    paymentMethod: "現金",
    points: "12",
    registerNo: "01",
    staff: null,
    cardType: null,
    rawNotes: null,
    overallConfidence: 0.88,
    fieldConfidence: {
      storeName: 0.9,
      date: 0.92,
      total: 0.95,
      paymentMethod: 0.85,
      items: 0.88,
    },
    visionSucceeded: true,
    model: "atlas-mock",
    sourceImageIds: [image.id],
  };
}

/**
 * Extract structured receipt data.
 *
 * P0-01 fail-closed:
 * - Mock data ONLY when isMockLlmEnabled() (never production, even if ATLAS_MOCK_LLM=true).
 * - Missing OpenAI config → explicit failure (NOT mock).
 * - Provider / parse / unreadable → visionSucceeded=false (no fake totals).
 */
export async function extractReceiptSchema(
  image: MediaImageInput,
  index = 0,
): Promise<ReceiptSchema> {
  // Dev/test only. Production always false inside isMockLlmEnabled().
  if (isMockLlmEnabled()) {
    return mockExtractReceipt(image, index);
  }

  if (!isOpenAIConfigured()) {
    return failedSchema([image.id], failureConfigMissing());
  }

  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: CHEAP_MODEL,
      max_output_tokens: 2_048,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: EXTRACT_PROMPT },
            {
              type: "input_image",
              image_url: image.dataUrl,
              detail: "auto",
            },
          ],
        },
      ],
    });
    const text = response.output_text?.trim() ?? "";
    if (!text) return failedSchema([image.id], failureUnreadable());
    return parseSchema(text, [image.id], CHEAP_MODEL);
  } catch (error) {
    const failure = failureFromProviderError(error);
    console.error("[receipt:extract] provider failure", {
      failureCode: failure.code,
      retryable: failure.retryable,
    });
    return failedSchema([image.id], failure);
  }
}

export async function extractReceiptSchemas(
  images: MediaImageInput[],
): Promise<ReceiptSchema[]> {
  const results: ReceiptSchema[] = [];
  for (let i = 0; i < images.length; i += 1) {
    results.push(await extractReceiptSchema(images[i]!, i));
  }
  return results;
}
