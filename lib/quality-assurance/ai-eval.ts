import {
  EVALUATION_CASES,
  evaluateCase,
} from "@/lib/request-understanding/evaluation-100";
import {
  formatsFromParsedRequest,
  understandRequest,
} from "@/lib/request-understanding/understand";

import { measuredRate, unmeasuredRate } from "@/lib/quality-assurance/rates";
import type { MeasuredRate } from "@/lib/quality-assurance/types";

export type AiEvalSnapshot = {
  intentSuccess: MeasuredRate;
  formatSuccess: MeasuredRate;
  avgConfidence: number | null;
  fallbackRate: MeasuredRate;
  misclassificationRate: MeasuredRate;
  caseCount: number;
};

/**
 * Deterministic request-understanding evaluation (105 cases).
 * This is measured offline evidence — not production traffic.
 */
export function measureRequestUnderstandingAccuracy(): AiEvalSnapshot {
  let intentOk = 0;
  let formatOk = 0;
  let formatChecked = 0;
  let confidenceSum = 0;
  let fallbackCount = 0;
  let misclassified = 0;

  for (const c of EVALUATION_CASES) {
    const parsed = understandRequest({
      assignment: c.assignment,
      attachments: c.attachments?.map((a, index) => ({
        id: `${c.id}_${index}`,
        fileName: a.fileName,
        mimeType: a.mimeType,
      })),
    });
    const formats = formatsFromParsedRequest(parsed);
    const evaluation = evaluateCase(
      {
        mode: parsed.execution_mode,
        formats,
        missing: parsed.missing_required_fields,
        needsClarify: parsed.needs_clarification,
        risks: parsed.risks,
        intent: parsed.intent,
        unsupported: parsed.intent === "unsupported",
      },
      c
    );

    confidenceSum += parsed.confidence;
    if (parsed.confidence < 0.55 || parsed.needs_clarification) {
      fallbackCount += 1;
    }

    if (c.expectMode.includes(parsed.execution_mode)) intentOk += 1;
    else misclassified += 1;

    if (c.expectFormats || c.expectFormatAnyOf) {
      formatChecked += 1;
      const formatPass = !evaluation.reasons.some((r) => r.includes("format"));
      if (formatPass) formatOk += 1;
      else misclassified += 1;
    }
  }

  const total = EVALUATION_CASES.length;
  if (total === 0) {
    return {
      intentSuccess: unmeasuredRate("request-understanding:empty"),
      formatSuccess: unmeasuredRate("request-understanding:empty"),
      avgConfidence: null,
      fallbackRate: unmeasuredRate("request-understanding:empty"),
      misclassificationRate: unmeasuredRate("request-understanding:empty"),
      caseCount: 0,
    };
  }

  return {
    intentSuccess: measuredRate(
      intentOk,
      total - intentOk,
      "request-understanding:evaluation-100"
    ),
    formatSuccess: measuredRate(
      formatOk,
      Math.max(0, formatChecked - formatOk),
      "request-understanding:evaluation-100"
    ),
    avgConfidence: confidenceSum / total,
    fallbackRate: measuredRate(
      total - fallbackCount,
      fallbackCount,
      "request-understanding:fallback"
    ),
    misclassificationRate: ratioAsFailureRate(misclassified, total),
    caseCount: total,
  };
}

function ratioAsFailureRate(failures: number, total: number): MeasuredRate {
  if (total <= 0) return unmeasuredRate("request-understanding:misclassification");
  return {
    rate: failures / total,
    success: Math.max(0, total - failures),
    failure: failures,
    total,
    measured: true,
    source: "request-understanding:misclassification",
  };
}
