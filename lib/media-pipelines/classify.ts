import "server-only";

import { CHEAP_MODEL } from "@/lib/ai/model-catalog";
import { isMockLlmEnabled } from "@/lib/ai/mock-responses";
import { isOpenAIConfigured, getOpenAIClient } from "@/lib/openai";

import type {
  MediaClassification,
  MediaImageInput,
  MediaKind,
  MediaPipelineRoute,
} from "./types";

const KIND_TO_PIPELINE: Record<MediaKind, MediaPipelineRoute["pipelineId"]> = {
  receipt: "receipt",
  invoice: "invoice",
  business_card: "business_card",
  contract: "contract",
  sales_material: "sales_material",
  whiteboard: "whiteboard",
  other: "unsupported",
};

function heuristicKind(filename: string): MediaClassification | null {
  const name = filename.toLowerCase();
  if (/レシート|領収|receipt|ryoshu/.test(name)) {
    return { kind: "receipt", confidence: 0.92, reason: "filename" };
  }
  if (/請求|invoice|seikyu/.test(name)) {
    return { kind: "invoice", confidence: 0.9, reason: "filename" };
  }
  if (/名刺|meishi|business.?card|namecard/.test(name)) {
    return { kind: "business_card", confidence: 0.9, reason: "filename" };
  }
  if (/契約|contract|nda/.test(name)) {
    return { kind: "contract", confidence: 0.88, reason: "filename" };
  }
  if (/ホワイトボード|whiteboard|板書/.test(name)) {
    return { kind: "whiteboard", confidence: 0.85, reason: "filename" };
  }
  return null;
}

function parseKindJson(text: string): MediaClassification {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { kind: "other", confidence: 0.2, reason: "unparsed" };
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      kind?: string;
      confidence?: number;
      reason?: string;
    };
    const kind = (parsed.kind ?? "other") as MediaKind;
    const allowed: MediaKind[] = [
      "receipt",
      "invoice",
      "business_card",
      "contract",
      "sales_material",
      "whiteboard",
      "other",
    ];
    return {
      kind: allowed.includes(kind) ? kind : "other",
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      reason: parsed.reason ?? "vision",
      model: CHEAP_MODEL,
    };
  } catch {
    return { kind: "other", confidence: 0.2, reason: "json_error" };
  }
}

/**
 * Classify a single image into a MediaKind.
 * Filename high-confidence shortcuts avoid Vision cost (eco).
 *
 * P0-01 fail-closed:
 * - Never invent "receipt" when OpenAI is unavailable in production.
 * - Mock receipt fallback only when isMockLlmEnabled() (non-production + flag).
 */
export async function classifyMediaImage(
  image: MediaImageInput,
  options?: { forceVision?: boolean; userHint?: string },
): Promise<MediaClassification> {
  const hint = (options?.userHint ?? "").toLowerCase();
  if (/家計簿|レシート|領収/.test(hint)) {
    return { kind: "receipt", confidence: 0.95, reason: "user_hint" };
  }

  const byName = heuristicKind(image.filename);
  if (byName && byName.confidence >= 0.9 && !options?.forceVision) {
    return byName;
  }

  // Dev/test mock only — production always false via isMockLlmEnabled().
  if (isMockLlmEnabled()) {
    if (byName) return byName;
    return {
      kind: "receipt",
      confidence: 0.55,
      reason: "mock",
    };
  }

  // P0-01: no_openai must NOT invent receipt / fake household data.
  if (!isOpenAIConfigured()) {
    if (byName) return byName;
    return {
      kind: "other",
      confidence: 0,
      reason: "openai_unavailable",
    };
  }

  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: CHEAP_MODEL,
      max_output_tokens: 256,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "この画像の種類を1つだけ判定し、JSONのみ返してください。",
                '形式: {"kind":"receipt|invoice|business_card|contract|sales_material|whiteboard|other","confidence":0.0-1.0,"reason":"..."}',
                "receipt=レシート/領収書の購入明細。invoice=請求書。business_card=名刺。",
                options?.userHint
                  ? `ユーザーの言葉: ${options.userHint.slice(0, 200)}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n"),
            },
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
    return parseKindJson(text);
  } catch (error) {
    console.error("[media-pipelines:classify] provider failure", {
      message: error instanceof Error ? error.message : "unknown",
    });
    // Fail closed: do not invent a receipt classification.
    if (byName) return byName;
    return {
      kind: "other",
      confidence: 0,
      reason: "openai_error",
    };
  }
}

export function routeMediaPipeline(
  classification: MediaClassification,
): MediaPipelineRoute {
  const pipelineId = KIND_TO_PIPELINE[classification.kind] ?? "unsupported";
  return {
    pipelineId,
    classification,
    bypassOrchestration: pipelineId === "receipt",
  };
}

export async function classifyAndRouteMedia(
  image: MediaImageInput,
  options?: { forceVision?: boolean; userHint?: string },
): Promise<MediaPipelineRoute> {
  const classification = await classifyMediaImage(image, options);
  return routeMediaPipeline(classification);
}
