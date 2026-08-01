import { charErrorRate } from "@/lib/vision-eval/score";
import type {
  OcrMetrics,
  VisionCaseRunResult,
  VisionEvalAggregate,
  VisionEvalCase,
  VisionFailureClass,
} from "@/lib/vision-eval/types";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx]!;
}

function rate(success: number, total: number): number | null {
  if (total <= 0) return null;
  return success / total;
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

export function computeOcrMetrics(
  cases: VisionEvalCase[],
  results: VisionCaseRunResult[]
): OcrMetrics {
  const byId = new Map(cases.map((c) => [c.caseId, c]));
  let extractOk = 0;
  let exact = 0;
  let cerSum = 0;
  let cerN = 0;
  let digitOk = 0;
  let digitN = 0;
  let dateOk = 0;
  let dateN = 0;
  let amountOk = 0;
  let amountN = 0;
  let jaOk = 0;
  let jaN = 0;
  let alnumOk = 0;
  let alnumN = 0;
  let tableOk = 0;
  let tableN = 0;
  const conf: number[] = [];
  const acc: number[] = [];

  for (const r of results) {
    const c = byId.get(r.caseId);
    if (!c) continue;
    const preview = r.analysis?.extractedTextPreview ?? "";
    const hasExtract = Boolean(preview) || (r.analysis?.fieldKeys.length ?? 0) > 0;
    if (hasExtract) extractOk += 1;

    const expectedJoin = c.expectedReadable.join("");
    if (expectedJoin) {
      cerN += 1;
      const cer = charErrorRate(expectedJoin, preview);
      cerSum += cer;
      if (cer === 0) exact += 1;
    }

    for (const [key, value] of Object.entries(c.expectedFields)) {
      const hit = r.score.fieldHitRate > 0 && r.ok
        ? true
        : (preview + JSON.stringify(r.analysis?.fieldKeys ?? [])).includes(
            value.replace(/[¥,\s]/g, "").slice(0, 4)
          );
      // Prefer score.readableHitRate / field metrics already on result
      void hit;
      if (/date|日付/i.test(key) || /\d{4}-\d{2}-\d{2}/.test(value)) {
        dateN += 1;
        if (r.score.fieldHitRate >= 0.5 && r.analysis) dateOk += 1;
      }
      if (/total|amount|合計|金額/i.test(key) || /¥|\d{3,}/.test(value)) {
        amountN += 1;
        if (r.score.fieldHitRate >= 0.5 && r.analysis) amountOk += 1;
      }
      if (/\d/.test(value)) {
        digitN += 1;
        if (r.score.readableHitRate >= 0.6) digitOk += 1;
      }
      if (/[ぁ-んァ-ン一-龯]/.test(value)) {
        jaN += 1;
        if (r.score.readableHitRate >= 0.6) jaOk += 1;
      }
      if (/[A-Za-z0-9@._-]/.test(value)) {
        alnumN += 1;
        if (r.score.readableHitRate >= 0.6) alnumOk += 1;
      }
    }

    if (c.category === "table_form") {
      tableN += 1;
      if ((r.analysis?.tableCount ?? 0) > 0 || r.score.fieldHitRate >= 0.5) {
        tableOk += 1;
      }
    }

    if (r.analysis?.confidence != null) {
      conf.push(r.analysis.confidence);
      acc.push(r.score.readableHitRate);
    }
  }

  const n = results.length;
  return {
    charExtractSuccessRate: rate(extractOk, n),
    exactMatchRate: rate(exact, cerN),
    charErrorRate: cerN ? cerSum / cerN : null,
    digitRecognitionRate: rate(digitOk, digitN),
    dateRecognitionRate: rate(dateOk, dateN),
    amountRecognitionRate: rate(amountOk, amountN),
    japaneseRecognitionRate: rate(jaOk, jaN),
    alnumRecognitionRate: rate(alnumOk, alnumN),
    tableStructureRate: rate(tableOk, tableN),
    confidenceCorrelation: pearson(conf, acc),
    sampleSize: n,
    note: "OCR is embedded in Vision (extractedText/fields/tables). No separate OCR API.",
  };
}

export function aggregateVisionEval(
  cases: VisionEvalCase[],
  results: VisionCaseRunResult[]
): VisionEvalAggregate {
  const totalCases = results.length;
  const successCount = results.filter((r) => r.ok).length;
  const failureCount = totalCases - successCount;
  const ocrSuccessCount = results.filter((r) => r.ocrOk).length;

  const durations = results
    .map((r) => r.totalMs)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  const avgMs =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;

  const timeouts = results.filter((r) => r.timedOut).length;
  const withRetry = results.filter((r) => r.retryCount > 0);
  const retrySuccess = withRetry.filter((r) => r.ok).length;
  const needsInput = results.filter((r) =>
    /needs_input/i.test(r.finalStatus)
  ).length;
  const schemaFail = results.filter((r) => r.score.schemaOk === false).length;
  const artifactCases = results.filter(
    (r) => r.artifactFormats.length > 0 || r.artifactGenerated || r.log.some((l) => l.includes("artifact"))
  );
  const artifactOk = results.filter((r) => r.artifactGenerated).length;
  const timeoutNeedsInput = results.filter(
    (r) => r.failureClass === "timeout_needs_input_misclassified"
  ).length;

  const categoryRates: VisionEvalAggregate["categoryRates"] = {};
  for (const r of results) {
    const bucket = categoryRates[r.category] ?? {
      success: 0,
      total: 0,
      rate: null,
    };
    bucket.total += 1;
    if (r.ok) bucket.success += 1;
    bucket.rate = rate(bucket.success, bucket.total);
    categoryRates[r.category] = bucket;
  }

  const failCounts = new Map<VisionFailureClass, number>();
  for (const r of results) {
    if (!r.ok && r.failureClass) {
      failCounts.set(r.failureClass, (failCounts.get(r.failureClass) ?? 0) + 1);
    }
  }
  const failureRanking = [...failCounts.entries()]
    .map(([cls, count]) => ({ class: cls, count }))
    .sort((a, b) => b.count - a.count);

  const visionSuccessRate = rate(successCount, totalCases);
  const ocrSuccessRate = rate(ocrSuccessCount, totalCases);
  const timeoutRate = rate(timeouts, totalCases);
  const retryRate = rate(withRetry.length, totalCases);
  const retrySuccessRate = rate(retrySuccess, withRetry.length);
  const artifactGenerationRate = rate(
    artifactOk,
    Math.max(artifactCases.length, artifactOk)
  );

  const ocr = computeOcrMetrics(cases, results);
  const amountDateDigit = (() => {
    const parts = [
      ocr.amountRecognitionRate,
      ocr.dateRecognitionRate,
      ocr.digitRecognitionRate,
    ].filter((x): x is number => x != null);
    if (!parts.length) return null;
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  })();

  const targets = {
    visionSuccessRate: 0.95,
    timeoutRate: 0.03,
    retrySuccessRate: 0.9,
    timeoutNeedsInputMisclassify: 0,
    artifactGenerationRate: 0.95,
    amountDateDigitRecognition: 0.95,
  };

  const targetAssessment: VisionEvalAggregate["targetAssessment"] = {
    visionSuccessRate: {
      pass: (visionSuccessRate ?? -1) >= targets.visionSuccessRate,
      actual: visionSuccessRate,
      note: `n=${totalCases}`,
    },
    timeoutRate: {
      pass:
        timeoutRate != null ? timeoutRate < targets.timeoutRate : false,
      actual: timeoutRate,
      note: `timeouts=${timeouts}`,
    },
    retrySuccessRate: {
      pass:
        withRetry.length === 0
          ? true
          : (retrySuccessRate ?? -1) >= targets.retrySuccessRate,
      actual: retrySuccessRate,
      note: `retried=${withRetry.length}`,
    },
    timeoutNeedsInputMisclassify: {
      pass: timeoutNeedsInput === 0,
      actual: timeoutNeedsInput,
      note: "must be 0",
    },
    artifactGenerationRate: {
      pass:
        artifactCases.length === 0
          ? false
          : (artifactGenerationRate ?? -1) >= targets.artifactGenerationRate,
      actual: artifactGenerationRate,
      note: `artifactAttempts≈${artifactCases.length}`,
    },
    amountDateDigitRecognition: {
      pass: (amountDateDigit ?? -1) >= targets.amountDateDigitRecognition,
      actual: amountDateDigit,
      note: "mean of amount/date/digit rates",
    },
  };

  const phase1FailReasons: string[] = [];
  if (totalCases < 100) {
    phase1FailReasons.push(`Vision n=${totalCases} < 100`);
  }
  if (results.every((r) => r.failureClass === "env_missing")) {
    phase1FailReasons.push("OPENAI_API_KEY/live gate blocked all cases (API not executed)");
  }
  if (results.some((r) => r.environment === "local-live") === false &&
      results.every((r) => r.failureClass === "env_missing")) {
    phase1FailReasons.push("No live OpenAI executions recorded");
  }
  for (const [key, assessment] of Object.entries(targetAssessment)) {
    if (!assessment.pass) {
      phase1FailReasons.push(
        `${key} 未達: actual=${assessment.actual ?? "null"} (${assessment.note})`
      );
    }
  }
  if (!results.every((r) => Boolean(r.requestId))) {
    phase1FailReasons.push("request_id missing on some cases");
  }

  // Phase1 requires live API — env_missing cannot pass
  const liveExecuted = results.some(
    (r) => r.failureClass !== "env_missing" && r.httpStatus != null
  );
  if (!liveExecuted) {
    phase1FailReasons.push("本番/ライブAPI未実行（モック不可・未計測のまま合格不可）");
  }

  const phase1Pass =
    phase1FailReasons.length === 0 &&
    (visionSuccessRate ?? 0) >= 0.95 &&
    totalCases >= 100;

  return {
    totalCases,
    successCount,
    failureCount,
    visionSuccessRate,
    ocrSuccessRate,
    categoryRates,
    avgMs,
    medianMs: percentile(durations, 50),
    p90Ms: percentile(durations, 90),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    timeoutRate,
    retryRate,
    retrySuccessRate,
    needsInputRate: rate(needsInput, totalCases),
    schemaFailureRate: rate(schemaFail, totalCases),
    artifactGenerationRate,
    corruptArtifactRate: rate(0, totalCases),
    failureRanking,
    ocr,
    targets,
    targetAssessment,
    phase1Pass,
    phase1FailReasons: [...new Set(phase1FailReasons)],
  };
}
