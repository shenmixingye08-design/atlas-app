/**
 * Optional dedicated OCR engine (Google Document AI).
 * Activated only when evaluation requires it AND credentials are present.
 * Never soft-succeeds when unconfigured.
 */

import "server-only";

import type { OcrEngine, OcrExtractResult } from "../types";

function documentAiConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DOCUMENT_AI_PROJECT?.trim() &&
      process.env.GOOGLE_DOCUMENT_AI_PROCESSOR?.trim() &&
      (process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN?.trim() ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()),
  );
}

export const documentAiOcrEngine: OcrEngine = {
  id: "document_ai",
  get configured() {
    return documentAiConfigured();
  },
  async extractText(input): Promise<OcrExtractResult> {
    if (!documentAiConfigured()) {
      return {
        ok: false,
        engineId: "document_ai",
        extractedText: "",
        confidence: 0,
        error: "document_ai_not_configured",
        softSuccess: false,
        configured: false,
      };
    }

    const project = process.env.GOOGLE_DOCUMENT_AI_PROJECT!.trim();
    const processor = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR!.trim();
    const location =
      process.env.GOOGLE_DOCUMENT_AI_LOCATION?.trim() || "us";
    const token = process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN?.trim();

    if (!token) {
      // Service-account JSON path without runtime token exchange is not
      // auto-wired here — fail closed rather than pretend success.
      return {
        ok: false,
        engineId: "document_ai",
        extractedText: "",
        confidence: 0,
        error: "document_ai_access_token_required",
        softSuccess: false,
        configured: false,
      };
    }

    const endpoint =
      `https://${location}-documentai.googleapis.com/v1/projects/` +
      `${project}/locations/${location}/processors/${processor}:process`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rawDocument: {
            content: input.imageBytes.toString("base64"),
            mimeType: input.mimeType,
          },
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        return {
          ok: false,
          engineId: "document_ai",
          extractedText: "",
          confidence: 0,
          error: `document_ai_http_${response.status}:${body.slice(0, 200)}`,
          softSuccess: false,
          configured: true,
        };
      }
      const json = (await response.json()) as {
        document?: { text?: string };
      };
      const extractedText = json.document?.text?.trim() ?? "";
      if (!extractedText) {
        return {
          ok: false,
          engineId: "document_ai",
          extractedText: "",
          confidence: 0,
          error: "document_ai_empty_text",
          softSuccess: false,
          configured: true,
        };
      }
      return {
        ok: true,
        engineId: "document_ai",
        extractedText,
        confidence: 0.9,
        error: null,
        softSuccess: false,
        configured: true,
        // correlation used for diagnostics only
      };
    } catch (error) {
      return {
        ok: false,
        engineId: "document_ai",
        extractedText: "",
        confidence: 0,
        error: error instanceof Error ? error.message : String(error),
        softSuccess: false,
        configured: true,
      };
    }
  },
};
