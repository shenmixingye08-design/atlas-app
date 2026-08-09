/**
 * P2-05: Runtime OCR engine policy for automation OCR steps.
 * Dedicated Document AI is used only when durable evaluation requires it.
 */

import "server-only";

import { getOcrEngine } from "./engines";
import { getLatestOcrEnginePolicy } from "./store";
import type { OcrEngineId } from "./types";

export type ActiveOcrPolicy = {
  engineId: OcrEngineId;
  dedicatedEngineRequired: boolean;
  source: "durable_evaluation" | "default_vision";
  failClosedReason: string | null;
};

/**
 * Resolve which OCR engine automation should use.
 * Fail-closed when dedicated engine is required but not configured.
 */
export async function resolveActiveOcrPolicy(): Promise<ActiveOcrPolicy> {
  const latest = await getLatestOcrEnginePolicy();
  if (!latest) {
    return {
      engineId: "openai_vision_ocr",
      dedicatedEngineRequired: false,
      source: "default_vision",
      failClosedReason: null,
    };
  }

  if (!latest.dedicatedEngineRequired) {
    return {
      engineId: "openai_vision_ocr",
      dedicatedEngineRequired: false,
      source: "durable_evaluation",
      failClosedReason: null,
    };
  }

  const dedicated = getOcrEngine("document_ai");
  if (!dedicated.configured) {
    return {
      engineId: "document_ai",
      dedicatedEngineRequired: true,
      source: "durable_evaluation",
      failClosedReason: "dedicated_engine_required_but_not_configured",
    };
  }

  return {
    engineId: "document_ai",
    dedicatedEngineRequired: true,
    source: "durable_evaluation",
    failClosedReason: null,
  };
}
