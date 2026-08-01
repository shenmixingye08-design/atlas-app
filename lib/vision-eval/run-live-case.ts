import { randomUUID } from "crypto";

import { buildOpenAiDataUrlFromBuffer } from "@/lib/vision/validate-openai-image-payload";
import { openAiVisionProvider } from "@/lib/vision/openai-vision-provider";
import {
  createVisionDiagnostic,
  getVisionDiagnosticForUser,
} from "@/lib/vision/diagnostics";
import { completeImageWorkToDeliverables } from "@/lib/vision/complete-image-work";
import { VisionError, type VisionAnalysisResult } from "@/lib/vision/types";
import { hintTypeForCase } from "@/lib/vision-eval/cases";
import { classifyVisionFailure } from "@/lib/vision-eval/classify-failure";
import { readCaseImage } from "@/lib/vision-eval/generate-images";
import { scoreVisionCase } from "@/lib/vision-eval/score";
import type { VisionCaseRunResult, VisionEvalCase } from "@/lib/vision-eval/types";

function previewText(text: string | null | undefined, max = 180): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function extractHttpStatus(error: unknown): number | null {
  if (error instanceof VisionError) {
    const v = error.details?.httpStatus;
    return typeof v === "number" ? v : null;
  }
  if (!error || typeof error !== "object") return null;
  const e = error as {
    status?: number;
    details?: { httpStatus?: number; status?: number };
  };
  return e.details?.httpStatus ?? e.details?.status ?? e.status ?? null;
}

function extractOpenAiRequestId(error: unknown): string | null {
  if (error instanceof VisionError) {
    const v = error.details?.requestId;
    return typeof v === "string" ? v : null;
  }
  if (!error || typeof error !== "object") return null;
  const e = error as {
    details?: { requestId?: string; openAiRequestId?: string; request_id?: string };
  };
  return (
    e.details?.requestId ??
    e.details?.openAiRequestId ??
    e.details?.request_id ??
    null
  );
}

export type RunLiveCaseOptions = {
  fixtureDir: string;
  userId?: string;
  generateArtifact?: boolean;
  environment?: VisionCaseRunResult["environment"];
};

/**
 * Live OpenAI Vision measurement for one case via production provider code.
 * No mocks. Does not log image bytes / base64.
 */
export async function runLiveVisionCase(
  c: VisionEvalCase,
  options: RunLiveCaseOptions
): Promise<VisionCaseRunResult> {
  const requestId = `veval_${c.caseId}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const jobId = `vjob_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const userId = options.userId ?? "vision_eval_user";
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const log: string[] = [`start request_id=${requestId} case=${c.caseId}`];

  const diagnostic = createVisionDiagnostic({
    userId,
    attachmentId: `eval_${c.caseId}`,
    jobId,
  });
  const diagnosticId = diagnostic.id;
  log.push(`diagnosticId=${diagnosticId} jobId=${jobId}`);

  let analysis: VisionAnalysisResult | null = null;
  let visionMs: number | null = null;
  let retryCount = 0;
  let timedOut = false;
  let httpStatus: number | null = null;
  let openAiRequestId: string | null = null;
  let failedStage: string | null = null;
  let developerCode: string | null = null;
  let userCode: string | null = null;
  let finalStatus = "failed";
  let thrown: unknown = null;
  let artifactGenerated = false;
  let artifactFormats: string[] = [];

  try {
    if (process.env.ATLAS_MOCK_LLM === "true") {
      throw new Error("ATLAS_MOCK_LLM=true — refusing live Vision measurement");
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw Object.assign(new Error("OPENAI_API_KEY missing"), {
        code: "env_missing",
      });
    }

    const bytes = readCaseImage(c, options.fixtureDir);
    log.push(`image_bytes=${bytes.length} (bytes only, no base64 logged)`);
    const { dataUrl } = buildOpenAiDataUrlFromBuffer(bytes);
    const hintType = hintTypeForCase(c);
    const userText = [
      "画像内の文字・数値・日付・項目を正確に抽出してください。",
      "推測で埋めず、読めない項目は空にしてください。",
      `想定文書: ${c.expectedDocumentType}`,
      ...Object.entries(c.expectedFields).map(
        ([k]) => `可能なら ${k} を fields に含めてください。`
      ),
    ].join("\n");

    const visionStarted = Date.now();
    const providerResult = await openAiVisionProvider.analyzeImage({
      userId,
      attachmentId: `eval_${c.caseId}`,
      imageUrl: dataUrl,
      imageBytes: bytes,
      userText,
      hintType,
      detail: "high",
      pageIndex: 0,
      pageCount: 1,
      jobId,
      diagnosticId,
    });
    visionMs = Date.now() - visionStarted;
    analysis = providerResult.result;
    finalStatus = "completed";
    httpStatus = 200;
    const diagAfter = getVisionDiagnosticForUser(userId, diagnosticId);
    const attemptStages =
      diagAfter?.stages.filter((s) => s.stage === "vision_request") ?? [];
    retryCount = Math.max(0, attemptStages.length - 1);
    openAiRequestId = diagAfter?.openaiRequestId ?? null;
    log.push(
      `vision_ok type=${analysis.detectedType} conf=${analysis.confidence} visionMs=${visionMs} openAiRequestId=${openAiRequestId ?? "n/a"}`
    );

    if (options.generateArtifact) {
      try {
        const batch = {
          id: `vbatch_eval_${c.caseId}`,
          images: [analysis],
          combinedSummary: analysis.summary,
          commonFields: analysis.fields,
          differences: [] as string[],
          mergedTables: analysis.tables,
          warnings: analysis.warnings,
          recommendedArtifactType: analysis.artifactSuggestions[0] ?? null,
          status: "analyzed" as const,
          model: analysis.model,
          detailLevel: analysis.detailLevel,
          createdAt: analysis.createdAt,
        };
        const completion = await completeImageWorkToDeliverables({
          userId,
          assignment: userText,
          batch,
          jobId,
        });
        artifactGenerated = completion.ok && completion.deliverables.length > 0;
        artifactFormats = completion.deliverables.map((d) => d.format);
        log.push(
          `artifact ok=${completion.ok} formats=${artifactFormats.join(",") || "none"}`
        );
        if (!completion.ok) finalStatus = "artifact_failed";
      } catch (artErr) {
        log.push(
          `artifact_error ${artErr instanceof Error ? artErr.message : String(artErr)}`
        );
      }
    }
  } catch (error) {
    thrown = error;
    httpStatus = extractHttpStatus(error);
    openAiRequestId = extractOpenAiRequestId(error);
    if (error instanceof VisionError) {
      developerCode = error.code;
      failedStage = error.failedStage ?? null;
      timedOut = error.code === "timeout";
      userCode =
        error.code === "timeout"
          ? "ai_analyze_failed"
          : error.code === "rate_limited"
            ? "ai_analyze_failed"
            : error.code;
      finalStatus = timedOut ? "timeout" : "failed";
      log.push(
        `VisionError code=${error.code} stage=${failedStage} status=${httpStatus}`
      );
    } else {
      developerCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "unknown";
      if (developerCode === "env_missing") finalStatus = "env_missing";
      log.push(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const schemaOk = Boolean(
    analysis &&
      (analysis.extractedText ||
        Object.keys(analysis.fields).length > 0 ||
        analysis.tables.length > 0) &&
      analysis.summary
  );

  const scored = scoreVisionCase(c, analysis, {
    timedOut,
    schemaOk,
    finalStatus,
  });

  if (!scored.ok && finalStatus === "completed") {
    finalStatus = "scored_failed";
  }

  const failureClass =
    scored.ok && !thrown
      ? null
      : classifyVisionFailure({
          error: thrown,
          timedOut,
          httpStatus,
          schemaOk,
          fieldHitRate: scored.fieldHitRate,
          ocrOk: scored.ocrOk,
          finalStatus,
          lowConfidence: analysis != null && analysis.confidence < 0.35,
          artifactFailed: finalStatus === "artifact_failed",
          envMissing: developerCode === "env_missing",
        });

  const finishedAt = new Date().toISOString();
  log.push(
    `end ok=${scored.ok} ocrOk=${scored.ocrOk} failureClass=${failureClass ?? "none"}`
  );

  return {
    caseId: c.caseId,
    category: c.category,
    ok: scored.ok,
    ocrOk: scored.ocrOk,
    requestId,
    jobId,
    diagnosticId,
    openAiRequestId,
    httpStatus,
    startedAt,
    finishedAt,
    totalMs: Date.now() - startedMs,
    visionMs,
    retryCount,
    finalStatus,
    failedStage,
    developerCode,
    userCode,
    timedOut,
    analysis: analysis
      ? {
          detectedType: analysis.detectedType,
          confidence: analysis.confidence,
          extractedTextPreview: previewText(analysis.extractedText),
          fieldKeys: Object.keys(analysis.fields ?? {}),
          tableCount: analysis.tables.length,
        }
      : null,
    artifactGenerated,
    artifactFormats,
    failureClass,
    failureReason: scored.reasons.join(",") || (thrown instanceof Error ? thrown.message : null),
    score: {
      fieldHitRate: scored.fieldHitRate,
      readableHitRate: scored.readableHitRate,
      typeOk: scored.typeOk,
      schemaOk: scored.schemaOk,
    },
    environment: options.environment ?? "local-live",
    log,
    screenshotPath: null,
    evidencePath: null,
  };
}
