/**
 * P2-05: Pluggable OCR engines.
 * Default: OpenAI Vision OCR. Dedicated (Document AI) only when evaluation requires it.
 */

export type OcrEngineId = "openai_vision_ocr" | "document_ai";

export type OcrExtractResult = {
  ok: boolean;
  engineId: OcrEngineId;
  extractedText: string;
  confidence: number;
  error: string | null;
  /** Never soft-succeed when provider missing / failed. */
  softSuccess: false;
  configured: boolean;
};

export type OcrEngine = {
  readonly id: OcrEngineId;
  readonly configured: boolean;
  extractText(input: {
    imageBytes: Buffer;
    mimeType: string;
    userId: string;
    correlationId: string;
  }): Promise<OcrExtractResult>;
};

export type OcrAccuracyResult = {
  tokensExpected: string[];
  tokensHit: string[];
  accuracy: number;
  accuracyGateOk: boolean;
};

export type OcrEngineEvaluationRecord = {
  id: string;
  correlationId: string;
  at: string;
  userId: string;
  engineId: OcrEngineId;
  dedicatedEngineRequired: boolean;
  accuracy: number;
  tokensExpected: string[];
  tokensHit: string[];
  extractedTextPreview: string;
  confidence: number;
  metadata: Record<string, unknown>;
};

/** Minimum token hit-rate for Vision OCR to be accepted without dedicated engine. */
export const OCR_ACCURACY_THRESHOLD = 1;

export const OCR_PROBE_OWNER = "__atlas_ocr_engine_probe__";
