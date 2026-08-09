/**
 * P2-05: Run OCR engine evaluation against ground-truth fixture.
 * Document AI is used only when Vision OCR fails the accuracy gate AND is configured.
 */

import "server-only";

import { randomUUID } from "crypto";

import { scoreOcrAccuracy, redactOcrText } from "./accuracy";
import { getOcrEngine } from "./engines";
import { buildOcrGroundTruthImage } from "./fixture";
import { persistOcrEngineEvaluation } from "./store";
import type {
  OcrEngineEvaluationRecord,
  OcrEngineId,
  OcrExtractResult,
} from "./types";
import { OCR_PROBE_OWNER } from "./types";

export type OcrEvaluationRunResult = {
  ok: boolean;
  record: OcrEngineEvaluationRecord | null;
  visionExtract: OcrExtractResult | null;
  dedicatedExtract: OcrExtractResult | null;
  accuracyGateOk: boolean;
  dedicatedEngineRequired: boolean;
  dedicatedEnginePolicyOk: boolean;
  activeEngineId: OcrEngineId;
  error: string | null;
  durableOk: boolean;
};

export async function runOcrEngineEvaluation(input?: {
  userId?: string;
  correlationId?: string;
}): Promise<OcrEvaluationRunResult> {
  const userId = input?.userId ?? OCR_PROBE_OWNER;
  const correlationId =
    input?.correlationId ?? `corr_ocr_eval_${randomUUID()}`;
  const fixture = await buildOcrGroundTruthImage();

  const vision = getOcrEngine("openai_vision_ocr");
  const visionExtract = await vision.extractText({
    imageBytes: fixture.bytes,
    mimeType: fixture.mimeType,
    userId,
    correlationId,
  });

  if (!visionExtract.configured) {
    return {
      ok: false,
      record: null,
      visionExtract,
      dedicatedExtract: null,
      accuracyGateOk: false,
      dedicatedEngineRequired: true,
      dedicatedEnginePolicyOk: false,
      activeEngineId: "openai_vision_ocr",
      error: visionExtract.error ?? "openai_not_configured",
      durableOk: false,
    };
  }

  if (!visionExtract.ok) {
    // Vision path failed hard — dedicated may be required.
    const dedicated = getOcrEngine("document_ai");
    const dedicatedExtract = dedicated.configured
      ? await dedicated.extractText({
          imageBytes: fixture.bytes,
          mimeType: fixture.mimeType,
          userId,
          correlationId,
        })
      : {
          ok: false,
          engineId: "document_ai" as const,
          extractedText: "",
          confidence: 0,
          error: "document_ai_not_configured",
          softSuccess: false as const,
          configured: false,
        };

    const dedicatedScore = scoreOcrAccuracy({
      extractedText: dedicatedExtract.extractedText,
      tokensExpected: fixture.tokens,
    });

    const dedicatedEngineRequired = true;
    const dedicatedEnginePolicyOk =
      dedicatedExtract.configured &&
      dedicatedExtract.ok &&
      dedicatedScore.accuracyGateOk;

    const activeEngineId: OcrEngineId = dedicatedEnginePolicyOk
      ? "document_ai"
      : "openai_vision_ocr";
    const score = dedicatedEnginePolicyOk
      ? dedicatedScore
      : scoreOcrAccuracy({
          extractedText: visionExtract.extractedText,
          tokensExpected: fixture.tokens,
        });

    const record: OcrEngineEvaluationRecord = {
      id: `ocr_eval_${randomUUID()}`,
      correlationId,
      at: new Date().toISOString(),
      userId,
      engineId: activeEngineId,
      dedicatedEngineRequired,
      accuracy: score.accuracy,
      tokensExpected: score.tokensExpected,
      tokensHit: score.tokensHit,
      extractedTextPreview: redactOcrText(
        dedicatedEnginePolicyOk
          ? dedicatedExtract.extractedText
          : visionExtract.extractedText,
      ),
      confidence: dedicatedEnginePolicyOk
        ? dedicatedExtract.confidence
        : visionExtract.confidence,
      metadata: {
        visionError: visionExtract.error,
        visionPreview: redactOcrText(visionExtract.extractedText, 240),
        dedicatedConfigured: dedicatedExtract.configured,
        softSuccess: false,
      },
    };

    const durable = await persistOcrEngineEvaluation(record);
    return {
      ok: dedicatedEnginePolicyOk && durable.ok,
      record,
      visionExtract,
      dedicatedExtract,
      accuracyGateOk: score.accuracyGateOk,
      dedicatedEngineRequired,
      dedicatedEnginePolicyOk,
      activeEngineId,
      error: dedicatedEnginePolicyOk
        ? durable.ok
          ? null
          : durable.error
        : "dedicated_engine_required_but_unavailable",
      durableOk: durable.ok,
    };
  }

  const visionScore = scoreOcrAccuracy({
    extractedText: visionExtract.extractedText,
    tokensExpected: fixture.tokens,
  });

  const dedicatedEngineRequired = !visionScore.accuracyGateOk;
  let dedicatedExtract: OcrExtractResult | null = null;
  let activeEngineId: OcrEngineId = "openai_vision_ocr";
  let finalScore = visionScore;
  let finalExtract = visionExtract;

  if (dedicatedEngineRequired) {
    const dedicated = getOcrEngine("document_ai");
    dedicatedExtract = await dedicated.extractText({
      imageBytes: fixture.bytes,
      mimeType: fixture.mimeType,
      userId,
      correlationId,
    });
    if (dedicatedExtract.ok) {
      const dedicatedScore = scoreOcrAccuracy({
        extractedText: dedicatedExtract.extractedText,
        tokensExpected: fixture.tokens,
      });
      if (dedicatedScore.accuracyGateOk) {
        activeEngineId = "document_ai";
        finalScore = dedicatedScore;
        finalExtract = dedicatedExtract;
      }
    }
  }

  const dedicatedEnginePolicyOk =
    !dedicatedEngineRequired ||
    (Boolean(dedicatedExtract?.configured) &&
      Boolean(dedicatedExtract?.ok) &&
      finalScore.accuracyGateOk &&
      activeEngineId === "document_ai");

  const record: OcrEngineEvaluationRecord = {
    id: `ocr_eval_${randomUUID()}`,
    correlationId,
    at: new Date().toISOString(),
    userId,
    engineId: activeEngineId,
    dedicatedEngineRequired,
    accuracy: finalScore.accuracy,
    tokensExpected: finalScore.tokensExpected,
    tokensHit: finalScore.tokensHit,
    extractedTextPreview: redactOcrText(finalExtract.extractedText),
    confidence: finalExtract.confidence,
      metadata: {
      visionAccuracy: visionScore.accuracy,
      visionPreview: redactOcrText(visionExtract.extractedText, 240),
      visionTokensHit: visionScore.tokensHit,
      dedicatedConfigured: Boolean(dedicatedExtract?.configured),
      softSuccess: false,
      p2: "P2-05",
    },
  };

  const durable = await persistOcrEngineEvaluation(record);
  const ok =
    durable.ok &&
    finalScore.accuracyGateOk &&
    dedicatedEnginePolicyOk &&
    visionExtract.softSuccess === false;

  return {
    ok,
    record,
    visionExtract,
    dedicatedExtract,
    accuracyGateOk: finalScore.accuracyGateOk,
    dedicatedEngineRequired,
    dedicatedEnginePolicyOk,
    activeEngineId,
    error: ok
      ? null
      : !durable.ok
        ? durable.error
        : !dedicatedEnginePolicyOk
          ? "dedicated_engine_required_but_unavailable"
          : "accuracy_gate_failed",
    durableOk: durable.ok,
  };
}
