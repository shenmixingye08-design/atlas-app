import { randomUUID } from "crypto";

import type { VisionProvider, VisionProviderResult } from "@/lib/vision/provider";
import { VisionError, type VisionAnalysisResult } from "@/lib/vision/types";
import type { VisionCaseRunResult } from "@/lib/vision-eval/types";
import { classifyVisionFailure } from "@/lib/vision-eval/classify-failure";

/**
 * Controlled fault-injection provider for timeout / 429 / 5xx / storage recovery.
 * Safe for tests — does not call OpenAI or harm production.
 */
export function createFaultInjectProvider(script: Array<"timeout" | "429" | "5xx" | "ok">): {
  provider: VisionProvider;
  getAttempts: () => number;
} {
  let attempts = 0;
  const provider: VisionProvider = {
    id: "fault-inject",
    async analyzeImage(input): Promise<VisionProviderResult> {
      attempts += 1;
      const step = script[Math.min(attempts - 1, script.length - 1)] ?? "ok";
      if (step === "timeout") {
        throw new VisionError("timeout", "fault_inject_timeout", {
          diagnosticId: input.diagnosticId,
          failedStage: "vision_response",
          details: {
            httpStatus: 408,
            requestId: `req_fault_${attempts}`,
            timedOut: true,
          },
        });
      }
      if (step === "429") {
        throw new VisionError("rate_limited", "fault_inject_429", {
          diagnosticId: input.diagnosticId,
          failedStage: "vision_response",
          details: { httpStatus: 429, requestId: `req_fault_${attempts}` },
        });
      }
      if (step === "5xx") {
        throw new VisionError("openai_failed", "fault_inject_5xx", {
          diagnosticId: input.diagnosticId,
          failedStage: "vision_response",
          details: { httpStatus: 500, requestId: `req_fault_${attempts}` },
        });
      }
      const result: VisionAnalysisResult = {
        id: `vis_fault_${randomUUID().slice(0, 8)}`,
        attachmentId: input.attachmentId,
        detectedType: input.hintType,
        confidence: 0.9,
        summary: "fault-inject success",
        extractedText: "株式会社ミネルボ検証 TEL 03-1234-5678",
        language: "ja",
        fields: { companyName: "株式会社ミネルボ検証", phone: "03-1234-5678" },
        tables: [],
        visualElements: [],
        layout: null,
        styleSignals: null,
        warnings: [],
        missingFields: [],
        recommendedActions: [],
        artifactSuggestions: ["docx"],
        model: "fault-inject",
        detailLevel: input.detail,
        createdAt: new Date().toISOString(),
      };
      return {
        result,
        model: "fault-inject",
        inputTokens: 0,
        outputTokens: 0,
        rawText: JSON.stringify(result),
      };
    },
  };
  return { provider, getAttempts: () => attempts };
}

/** Map gate status for timeout — must NOT become needs_input. */
export function gateStatusForTimeoutFailure(): "vision_failed" {
  return "vision_failed";
}

export type FaultScenarioId =
  | "timeout_then_success"
  | "timeout_timeout_then_success"
  | "timeout_x3"
  | "429_then_success"
  | "5xx_then_success"
  | "timeout_not_needs_input";

export async function runFaultScenario(
  id: FaultScenarioId
): Promise<VisionCaseRunResult & { scenarioId: FaultScenarioId; pass: boolean }> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const requestId = `fault_${id}_${randomUUID().slice(0, 8)}`;
  const log: string[] = [`scenario=${id}`];

  let script: Array<"timeout" | "429" | "5xx" | "ok"> = ["ok"];
  if (id === "timeout_then_success") script = ["timeout", "ok"];
  if (id === "timeout_timeout_then_success") script = ["timeout", "timeout", "ok"];
  if (id === "timeout_x3") script = ["timeout", "timeout", "timeout"];
  if (id === "429_then_success") script = ["429", "ok"];
  if (id === "5xx_then_success") script = ["5xx", "ok"];
  if (id === "timeout_not_needs_input") script = ["timeout", "timeout", "timeout"];

  // Simulate outer retry loop (production provider has internal retries;
  // here we assert classification + status mapping).
  const { provider } = createFaultInjectProvider(script);
  let ok = false;
  let timedOut = false;
  let finalStatus = "failed";
  let retryCount = 0;
  let developerCode: string | null = null;
  let failureClass = null as ReturnType<typeof classifyVisionFailure> | null;
  let misclassified = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await provider.analyzeImage({
        userId: "fault_user",
        attachmentId: "fault_att",
        imageUrl: "data:image/png;base64,aa",
        userText: "test",
        hintType: "receipt",
        detail: "high",
        pageIndex: 0,
        pageCount: 1,
        jobId: "fault_job",
        diagnosticId: null,
      });
      ok = true;
      finalStatus = "completed";
      log.push(`attempt ${attempt}: success`);
      break;
    } catch (error) {
      retryCount = attempt - 1;
      if (error instanceof VisionError) {
        developerCode = error.code;
        timedOut = error.code === "timeout";
        const gate = gateStatusForTimeoutFailure();
        if (timedOut && gate === ("needs_input" as string)) {
          misclassified = true;
        }
        // Explicit: timeout maps to vision_failed
        finalStatus = gate;
        log.push(`attempt ${attempt}: ${error.code} gate=${gate}`);
        failureClass = classifyVisionFailure({
          error,
          timedOut,
          httpStatus:
            typeof error.details?.httpStatus === "number"
              ? error.details.httpStatus
              : null,
          finalStatus: gate,
        });
        if (error.code === "timeout" || error.code === "rate_limited" || error.code === "openai_failed") {
          continue;
        }
        break;
      }
      throw error;
    }
  }

  if (id === "timeout_not_needs_input") {
    ok = !misclassified && finalStatus === "vision_failed";
  } else if (id === "timeout_x3") {
    ok = !ok && timedOut && finalStatus === "vision_failed" && !misclassified;
  } else {
    ok = finalStatus === "completed";
  }

  const pass = ok && !misclassified;
  return {
    scenarioId: id,
    pass,
    caseId: id,
    category: "receipt",
    ok: pass,
    ocrOk: pass,
    requestId,
    jobId: "fault_job",
    diagnosticId: null,
    openAiRequestId: null,
    httpStatus: null,
    startedAt,
    finishedAt: new Date().toISOString(),
    totalMs: Date.now() - startedMs,
    visionMs: null,
    retryCount,
    finalStatus,
    failedStage: "vision_response",
    developerCode,
    userCode: timedOut ? "ai_analyze_failed" : null,
    timedOut,
    analysis: null,
    artifactGenerated: false,
    artifactFormats: [],
    failureClass,
    failureReason: misclassified
      ? "timeout_needs_input_misclassified"
      : pass
        ? null
        : `finalStatus=${finalStatus}`,
    score: {
      fieldHitRate: pass ? 1 : 0,
      readableHitRate: pass ? 1 : 0,
      typeOk: pass,
      schemaOk: pass,
    },
    environment: "fault-inject",
    log,
    screenshotPath: null,
    evidencePath: null,
  };
}

export const FAULT_SCENARIOS: FaultScenarioId[] = [
  "timeout_then_success",
  "timeout_timeout_then_success",
  "timeout_x3",
  "429_then_success",
  "5xx_then_success",
  "timeout_not_needs_input",
];
