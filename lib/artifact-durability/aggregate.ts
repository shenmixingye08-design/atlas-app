import type {
  ArtifactCaseResult,
  ArtifactDurabilityAggregate,
  ArtifactFailureClass,
  ArtifactFormatUnderTest,
  ConversionCaseResult,
  FormatAggregate,
} from "@/lib/artifact-durability/types";

function rate(success: number, total: number): number | null {
  if (total <= 0) return null;
  return success / total;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx]!;
}

function formatAgg(
  format: ArtifactFormatUnderTest,
  rows: ArtifactCaseResult[]
): FormatAggregate {
  const total = rows.length;
  const generateSuccess = rows.filter((r) => r.okGenerate).length;
  const structureSuccess = rows.filter((r) => r.okStructure).length;
  const storageSuccess = rows.filter((r) => r.okStorage).length;
  const previewSuccess = rows.filter((r) => r.okPreview).length;
  const downloadSuccess = rows.filter((r) => r.okDownload).length;
  const revisionRows = rows.filter((r) => r.revisionAttempted);
  const revisionSuccess = revisionRows.filter((r) => r.okRevision).length;
  const finalSuccess = rows.filter((r) => r.okFinal).length;
  const corruptCount = rows.filter(
    (r) => r.okGenerate && !r.okStructure
  ).length;
  const zeroByteCount = rows.filter((r) => r.fileSize === 0).length;
  const durations = rows
    .map((r) => r.totalMs)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  const sizes = rows
    .map((r) => r.fileSize)
    .filter((n): n is number => typeof n === "number" && n > 0);
  return {
    format,
    total,
    generateSuccess,
    structureSuccess,
    storageSuccess,
    previewSuccess,
    downloadSuccess,
    revisionSuccess,
    finalSuccess,
    corruptCount,
    zeroByteCount,
    generateRate: rate(generateSuccess, total),
    structureRate: rate(structureSuccess, total),
    storageRate: rate(storageSuccess, total),
    previewRate: rate(previewSuccess, total),
    downloadRate: rate(downloadSuccess, total),
    revisionRate: rate(revisionSuccess, revisionRows.length),
    finalRate: rate(finalSuccess, total),
    corruptRate: rate(corruptCount, total),
    avgMs:
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null,
    medianMs: percentile(durations, 50),
    p90Ms: percentile(durations, 90),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    avgFileBytes:
      sizes.length > 0
        ? sizes.reduce((a, b) => a + b, 0) / sizes.length
        : null,
    productionCount: rows.filter((r) => r.environment === "production-http")
      .length,
  };
}

export function aggregateArtifactDurability(input: {
  results: ArtifactCaseResult[];
  conversions: ConversionCaseResult[];
  productionRequiredPerFormat?: number;
}): ArtifactDurabilityAggregate {
  const formats: ArtifactFormatUnderTest[] = ["docx", "xlsx", "pdf", "pptx"];
  const byFormat = {} as Record<ArtifactFormatUnderTest, FormatAggregate>;
  for (const f of formats) {
    byFormat[f] = formatAgg(
      f,
      input.results.filter((r) => r.format === f)
    );
  }

  const failCounts = new Map<ArtifactFailureClass, number>();
  for (const r of input.results) {
    if (!r.okFinal && r.failureClass) {
      failCounts.set(r.failureClass, (failCounts.get(r.failureClass) ?? 0) + 1);
    }
  }
  for (const c of input.conversions) {
    if (!c.ok && c.failureClass) {
      failCounts.set(c.failureClass, (failCounts.get(c.failureClass) ?? 0) + 1);
    }
  }

  const byPair: ArtifactDurabilityAggregate["conversion"]["byPair"] = {};
  for (const c of input.conversions) {
    const key = `${c.sourceFormat}->${c.targetFormat}`;
    const bucket = byPair[key] ?? { total: 0, success: 0, rate: null };
    bucket.total += 1;
    if (c.ok) bucket.success += 1;
    bucket.rate = rate(bucket.success, bucket.total);
    byPair[key] = bucket;
  }

  const convSuccess = input.conversions.filter((c) => c.ok).length;
  const prodNeed = input.productionRequiredPerFormat ?? 20;
  const crossUserAccessCount = input.results.filter((r) =>
    r.log.some((line) => line.includes("cross_user_leak=true"))
  ).length;
  const revisionSourceLostCount = input.results.filter(
    (r) =>
      r.revisionAttempted &&
      r.okRevision === false &&
      /source.*(lost|missing|not found)|元成果物/i.test(r.failureReason ?? "")
  ).length;
  const shaSet = new Set(
    input.results.map((r) => r.sha256).filter((s): s is string => Boolean(s))
  );
  const duplicateRate =
    input.results.length > 0
      ? 1 -
        shaSet.size /
          Math.max(
            1,
            input.results.filter((r) => r.sha256).length
          )
      : 0;

  const targets = {
    wordFinal: 0.99,
    excelFinal: 0.99,
    pdfFinal: 0.99,
    pptxFinal: 0.99,
    corruptRate: 0,
    zeroByteRate: 0,
    conversionRate: 0.95,
    productionPerFormat: prodNeed,
  };

  const targetAssessment: ArtifactDurabilityAggregate["targetAssessment"] = {
    wordFinal: {
      pass: (byFormat.docx.finalRate ?? -1) >= targets.wordFinal && byFormat.docx.total >= 100,
      actual: byFormat.docx.finalRate,
      note: `n=${byFormat.docx.total}`,
    },
    excelFinal: {
      pass: (byFormat.xlsx.finalRate ?? -1) >= targets.excelFinal && byFormat.xlsx.total >= 100,
      actual: byFormat.xlsx.finalRate,
      note: `n=${byFormat.xlsx.total}`,
    },
    pdfFinal: {
      pass: (byFormat.pdf.finalRate ?? -1) >= targets.pdfFinal && byFormat.pdf.total >= 100,
      actual: byFormat.pdf.finalRate,
      note: `n=${byFormat.pdf.total}`,
    },
    pptxFinal: {
      pass: (byFormat.pptx.finalRate ?? -1) >= targets.pptxFinal && byFormat.pptx.total >= 100,
      actual: byFormat.pptx.finalRate,
      note: `n=${byFormat.pptx.total}`,
    },
    corruptRate: {
      pass: formats.every((f) => (byFormat[f].corruptRate ?? 1) === 0),
      actual: Math.max(
        ...formats.map((f) => byFormat[f].corruptRate ?? 0)
      ),
      note: "must be 0",
    },
    zeroByte: {
      pass: formats.every((f) => byFormat[f].zeroByteCount === 0),
      actual: formats.reduce((a, f) => a + byFormat[f].zeroByteCount, 0),
      note: "count",
    },
    productionPerFormat: {
      pass: formats.every((f) => byFormat[f].productionCount >= prodNeed),
      actual: Math.min(...formats.map((f) => byFormat[f].productionCount)),
      note: `required >= ${prodNeed} each`,
    },
    conversion: {
      pass:
        input.conversions.length >= 9 * 20 &&
        (rate(convSuccess, input.conversions.length) ?? -1) >= 0.95,
      actual: rate(convSuccess, input.conversions.length),
      note: `n=${input.conversions.length}`,
    },
    crossUserAccess: {
      pass: crossUserAccessCount === 0,
      actual: crossUserAccessCount,
      note: "must be 0",
    },
    duplicateArtifacts: {
      pass: duplicateRate < 0.005,
      actual: duplicateRate,
      note: "sha256 collision rate < 0.5%",
    },
  };

  const phase2FailReasons: string[] = [];
  for (const [k, v] of Object.entries(targetAssessment)) {
    if (!v.pass) {
      phase2FailReasons.push(
        `${k} 未達: actual=${v.actual ?? "null"} (${v.note})`
      );
    }
  }
  if (input.results.length < 400) {
    phase2FailReasons.push(`total n=${input.results.length} < 400`);
  }
  if (revisionSourceLostCount > 0) {
    phase2FailReasons.push(
      `revision時の元成果物消失: ${revisionSourceLostCount}`
    );
  }

  return {
    totalCases: input.results.length,
    byFormat,
    conversion: {
      total: input.conversions.length,
      success: convSuccess,
      rate: rate(convSuccess, input.conversions.length),
      byPair,
    },
    failureRanking: [...failCounts.entries()]
      .map(([cls, count]) => ({ class: cls, count }))
      .sort((a, b) => b.count - a.count),
    mimeMismatchCount: 0,
    extensionSpoofCount: 0,
    crossUserAccessCount,
    revisionSourceLostCount,
    duplicateRate,
    targets,
    targetAssessment,
    phase2Pass: phase2FailReasons.length === 0,
    phase2FailReasons: [...new Set(phase2FailReasons)],
  };
}
