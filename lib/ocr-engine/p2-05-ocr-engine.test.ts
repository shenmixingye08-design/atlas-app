/**
 * P2-05: OCR dedicated-engine evaluation — unit contracts.
 * Live OpenAI + DB paths are covered by Production `/api/health/ocr-engine`.
 */

import { describe, expect, it } from "vitest";

import { scoreOcrAccuracy, redactOcrText } from "./accuracy";
import { OCR_GROUND_TRUTH_TOKENS, buildOcrGroundTruthImage } from "./fixture";
import { ATLAS_OCR_ENGINE_EVALUATIONS_MIGRATION_SQL } from "./migration-sql";
import { OCR_ACCURACY_THRESHOLD } from "./types";

describe("P2-05 OCR engine evaluation", () => {
  it("scores accuracy gate against ground-truth tokens", () => {
    const perfect = scoreOcrAccuracy({
      extractedText: "MINERVOT OCR EVAL ATLAS-OCR-7842 ITEM TOTAL 1280",
      tokensExpected: OCR_GROUND_TRUTH_TOKENS,
    });
    expect(perfect.accuracy).toBe(1);
    expect(perfect.accuracyGateOk).toBe(true);

    const partial = scoreOcrAccuracy({
      extractedText: "MINERVOT only",
      tokensExpected: OCR_GROUND_TRUTH_TOKENS,
    });
    expect(partial.accuracyGateOk).toBe(false);
    expect(partial.accuracy).toBeLessThan(OCR_ACCURACY_THRESHOLD);
  });

  it("builds ground-truth PNG fixture with expected tokens metadata", async () => {
    const fixture = await buildOcrGroundTruthImage();
    expect(fixture.mimeType).toBe("image/png");
    expect(fixture.bytes.subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
    expect(fixture.tokens).toEqual([...OCR_GROUND_TRUTH_TOKENS]);
    expect(fixture.bytes.byteLength).toBeGreaterThan(500);
  });

  it("redacts secrets from OCR previews", () => {
    expect(redactOcrText("Bearer sk-abcdefghijklmnop")).toContain("[redacted]");
    expect(redactOcrText("x".repeat(1000)).length).toBeLessThanOrEqual(500);
  });

  it("migration SQL is idempotent and names evaluation table", () => {
    expect(ATLAS_OCR_ENGINE_EVALUATIONS_MIGRATION_SQL).toContain(
      "atlas_ocr_engine_evaluations",
    );
    expect(ATLAS_OCR_ENGINE_EVALUATIONS_MIGRATION_SQL).toContain(
      "create table if not exists",
    );
    expect(ATLAS_OCR_ENGINE_EVALUATIONS_MIGRATION_SQL).toContain(
      "dedicated_engine_required",
    );
  });

  it("document AI engine fail-closes when unconfigured", async () => {
    const prev = {
      project: process.env.GOOGLE_DOCUMENT_AI_PROJECT,
      processor: process.env.GOOGLE_DOCUMENT_AI_PROCESSOR,
      token: process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN,
    };
    delete process.env.GOOGLE_DOCUMENT_AI_PROJECT;
    delete process.env.GOOGLE_DOCUMENT_AI_PROCESSOR;
    delete process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN;

    const { documentAiOcrEngine } = await import("./engines/document-ai");
    expect(documentAiOcrEngine.configured).toBe(false);
    const result = await documentAiOcrEngine.extractText({
      imageBytes: Buffer.from("x"),
      mimeType: "image/png",
      userId: "u",
      correlationId: "c",
    });
    expect(result.ok).toBe(false);
    expect(result.softSuccess).toBe(false);
    expect(result.error).toBe("document_ai_not_configured");

    if (prev.project) process.env.GOOGLE_DOCUMENT_AI_PROJECT = prev.project;
    if (prev.processor) {
      process.env.GOOGLE_DOCUMENT_AI_PROCESSOR = prev.processor;
    }
    if (prev.token) process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN = prev.token;
  });

  it("openai vision OCR fail-closes when OpenAI missing", async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const { openaiVisionOcrEngine } = await import("./engines/openai-vision-ocr");
    const result = await openaiVisionOcrEngine.extractText({
      imageBytes: Buffer.from("x"),
      mimeType: "image/png",
      userId: "u",
      correlationId: "c",
    });
    expect(result.ok).toBe(false);
    expect(result.softSuccess).toBe(false);
    expect(result.configured).toBe(false);
    if (prev) process.env.OPENAI_API_KEY = prev;
  });

  it("exports probeOcrEngine", async () => {
    const mod = await import("./ocr-engine-probe");
    expect(typeof mod.probeOcrEngine).toBe("function");
  });

  it("policy defaults to vision when no durable evaluation", async () => {
    const { resolveActiveOcrPolicy } = await import("./policy");
    // Without service role, latest policy is null → default vision.
    const policy = await resolveActiveOcrPolicy();
    expect(policy.engineId).toBe("openai_vision_ocr");
    expect(policy.failClosedReason).toBeNull();
  });

  it("dedicated-required decision flips when accuracy gate fails", () => {
    const failed = scoreOcrAccuracy({
      extractedText: "unrelated",
      tokensExpected: OCR_GROUND_TRUTH_TOKENS,
    });
    expect(failed.accuracyGateOk).toBe(false);
    const dedicatedEngineRequired = !failed.accuracyGateOk;
    expect(dedicatedEngineRequired).toBe(true);
  });
});
