import "server-only";

import { measureRequestUnderstandingAccuracy } from "@/lib/quality-assurance/ai-eval";
import {
  collectRuntimeCriticalFindings,
  collectStaticCriticalFindings,
} from "@/lib/quality-assurance/critical-gate";
import { loadLatestEvidenceSuite } from "@/lib/quality-assurance/evidence-store";
import { evaluateQualityGates } from "@/lib/quality-assurance/gates";
import {
  measuredLatency,
  measuredRate,
  ratioRate,
  unmeasuredLatency,
  unmeasuredRate,
} from "@/lib/quality-assurance/rates";
import { isProductionE2eConfigured } from "@/lib/quality-assurance/run-evidence-suite";
import type {
  EvidenceSuiteSummary,
  MeasuredRate,
  QualityDashboardSnapshot,
  QualityMetricSection,
} from "@/lib/quality-assurance/types";
import { getWordMetricsSnapshot } from "@/lib/deliverables/word-metrics";
import { getJobMetrics24h } from "@/lib/jobs/job-store";
import {
  getReliabilityWindowMetrics,
  type ReliabilityMetricBucket,
  type ReliabilityWindow,
} from "@/lib/reliability/metrics";
import {
  artifactRatesFromPhase2,
  loadLatestArtifactDurability,
} from "@/lib/artifact-durability/load-latest";
import {
  loadLatestVisionPhase1,
  visionRatesFromPhase1,
} from "@/lib/vision-eval/load-latest";

function rateFromBucket(
  bucket: ReliabilityMetricBucket | undefined,
  source: string
): MeasuredRate {
  if (!bucket) return unmeasuredRate(source);
  return measuredRate(bucket.success, bucket.failure, source);
}

function latencyFromBucket(
  bucket: ReliabilityMetricBucket | undefined,
  source: string
) {
  if (!bucket || bucket.durationCount <= 0) return unmeasuredLatency(source);
  return measuredLatency(
    bucket.durationSumMs / bucket.durationCount,
    null,
    bucket.durationCount,
    source
  );
}

function evidenceCategoryRate(
  evidence: EvidenceSuiteSummary | null,
  categories: string[],
  source: string
): MeasuredRate {
  if (!evidence) return unmeasuredRate(source);
  const subset = evidence.cases.filter((c) => categories.includes(c.category));
  if (subset.length === 0) return unmeasuredRate(source);
  const success = subset.filter((c) => c.ok).length;
  return measuredRate(success, subset.length - success, source);
}

function mergePreferMeasured(
  primary: MeasuredRate,
  fallback: MeasuredRate
): MeasuredRate {
  if (primary.measured) return primary;
  return fallback;
}

export type BuildQualitySnapshotOptions = {
  windowDays?: ReliabilityWindow;
  evidence?: EvidenceSuiteSummary | null;
  /** Override production verification (tests). */
  productionE2eVerified?: boolean;
};

/**
 * Compose Owner Quality Dashboard from reliability windows, word metrics,
 * request-understanding eval, jobs, and evidence suite. Never invents rates.
 */
export async function buildQualityDashboardSnapshot(
  options: BuildQualitySnapshotOptions = {}
): Promise<QualityDashboardSnapshot> {
  const windowDays = options.windowDays ?? 7;
  const [windows, jobMetrics] = await Promise.all([
    getReliabilityWindowMetrics([windowDays]),
    getJobMetrics24h(),
  ]);
  const window = windows[0]!;
  const word = getWordMetricsSnapshot();
  const ai = measureRequestUnderstandingAccuracy();
  const evidence =
    options.evidence !== undefined
      ? options.evidence
      : loadLatestEvidenceSuite();

  const productionE2eVerified =
    options.productionE2eVerified ??
    (isProductionE2eConfigured() &&
      evidence?.environment === "production" &&
      evidence.failed === 0 &&
      evidence.totalCases > 0);

  // Deliverables — prefer Phase2 durability (n>=100) when present; else reliability/word/evidence
  const phase2Rates = artifactRatesFromPhase2(loadLatestArtifactDurability());
  const wordRel = rateFromBucket(
    window.buckets.export_word,
    `reliability:${windowDays}d:export_word`
  );
  const wordLocal =
    word.successRate != null
      ? measuredRate(word.successes, word.failures, "word-metrics:24h")
      : unmeasuredRate("word-metrics:24h");
  const wordEvidence = evidenceCategoryRate(evidence, ["word"], "evidence:word");
  const wordRate = mergePreferMeasured(
    phase2Rates.wordFinal,
    mergePreferMeasured(mergePreferMeasured(wordRel, wordLocal), wordEvidence)
  );

  const excelRel = rateFromBucket(
    window.buckets.export_excel,
    `reliability:${windowDays}d:export_excel`
  );
  const excelEvidence = evidenceCategoryRate(
    evidence,
    ["excel"],
    "evidence:excel"
  );
  const excelRate = mergePreferMeasured(
    phase2Rates.excelFinal,
    mergePreferMeasured(excelRel, excelEvidence)
  );

  const pdfRel = rateFromBucket(
    window.buckets.export_pdf,
    `reliability:${windowDays}d:export_pdf`
  );
  const pdfEvidence = evidenceCategoryRate(evidence, ["pdf"], "evidence:pdf");
  const pdfRate = mergePreferMeasured(
    phase2Rates.pdfFinal,
    mergePreferMeasured(pdfRel, pdfEvidence)
  );

  // No dedicated powerpoint reliability key yet
  const powerpointRate = mergePreferMeasured(
    phase2Rates.pptxFinal,
    evidenceCategoryRate(evidence, ["pptx"], "evidence:powerpoint")
  );

  const csvRate = evidenceCategoryRate(evidence, ["csv"], "evidence:csv");

  const genBucket = window.buckets.deliverable_generate;
  const deliverableFailure =
    genBucket && genBucket.success + genBucket.failure > 0
      ? ratioRate(
          genBucket.failure,
          genBucket.success + genBucket.failure,
          `reliability:${windowDays}d:deliverable_generate:failure`
        )
      : word.failureRate != null
        ? {
            rate: word.failureRate,
            success: word.successes,
            failure: word.failures,
            total: word.successes + word.failures,
            measured: true,
            source: "word-metrics:failureRate",
          }
        : unmeasuredRate("deliverable:failure");

  const retryDenom =
    (genBucket?.success ?? 0) +
    (genBucket?.failure ?? 0) +
    (genBucket?.retry ?? 0);
  const retryRate =
    retryDenom > 0 && genBucket
      ? ratioRate(genBucket.retry, retryDenom, `reliability:${windowDays}d:retry`)
      : word.retryRate != null
        ? {
            rate: word.retryRate,
            success: Math.max(0, word.requests - word.retries),
            failure: word.retries,
            total: word.requests,
            measured: true,
            source: "word-metrics:retryRate",
          }
        : unmeasuredRate("deliverable:retry");

  const corruptRate =
    word.verifyFailures + word.wordConvertFailures > 0 || word.requests > 0
      ? ratioRate(
          word.verifyFailures + word.wordConvertFailures,
          Math.max(word.requests, word.verifyFailures + word.wordConvertFailures),
          "word-metrics:corrupt"
        )
      : unmeasuredRate("word-metrics:corrupt");

  const avgGenerateMs = measuredLatency(
    word.avgGenerateMs ?? window.avgDurationMs.export_word ?? null,
    word.p95GenerateMs,
    word.successes + word.failures ||
      (window.buckets.export_word?.durationCount ?? 0),
    word.avgGenerateMs != null
      ? "word-metrics:generate_ms"
      : `reliability:${windowDays}d:export_word`
  );

  // Vision — prefer Phase1 live suite (n>=100) over single evidence case
  const visionPhase1 = loadLatestVisionPhase1();
  const visionPhase1Rates = visionRatesFromPhase1(visionPhase1);
  const visionEvidence = mergePreferMeasured(
    visionPhase1Rates.visionSuccess,
    evidenceCategoryRate(evidence, ["vision"], "evidence:vision")
  );
  const ocrEvidence = mergePreferMeasured(
    visionPhase1Rates.ocrSuccess,
    evidenceCategoryRate(evidence, ["ocr"], "evidence:ocr")
  );
  const timeoutBucket = window.buckets.timeout;
  const timeoutTotal =
    (timeoutBucket?.success ?? 0) +
    (timeoutBucket?.failure ?? 0) +
    (timeoutBucket?.timeout ?? 0);
  const openaiTimeoutRate = mergePreferMeasured(
    visionPhase1Rates.timeoutRate.measured
      ? ratioRate(
          visionPhase1Rates.timeoutRate.failure,
          visionPhase1Rates.timeoutRate.total,
          "vision-phase1:timeout"
        )
      : unmeasuredRate("vision-phase1:timeout"),
    timeoutTotal > 0 && timeoutBucket
      ? ratioRate(
          timeoutBucket.timeout,
          timeoutTotal,
          `reliability:${windowDays}d:timeout`
        )
      : unmeasuredRate("vision:openai_timeout")
  );

  // Jobs
  const jobTotal = jobMetrics.total;
  const jobCompletedRate =
    jobTotal > 0
      ? measuredRate(
          jobMetrics.completed,
          Math.max(0, jobTotal - jobMetrics.completed),
          "jobs:24h:completed"
        )
      : rateFromBucket(window.buckets.work_job, `reliability:${windowDays}d:work_job`);
  const jobFailedRate =
    jobTotal > 0
      ? ratioRate(jobMetrics.failed, jobTotal, "jobs:24h:failed")
      : unmeasuredRate("jobs:24h:failed");
  const jobRetryRate =
    jobTotal > 0
      ? ratioRate(jobMetrics.retrying, jobTotal, "jobs:24h:retrying")
      : unmeasuredRate("jobs:24h:retrying");
  const needsInputRate = unmeasuredRate("jobs:needs_input"); // not in JobMetrics24h

  // Notifications
  const notifyRel = rateFromBucket(
    window.buckets.notification_ack,
    `reliability:${windowDays}d:notification_ack`
  );
  const pushRate =
    jobMetrics.pushOk + jobMetrics.pushFailed > 0
      ? measuredRate(
          jobMetrics.pushOk,
          jobMetrics.pushFailed,
          "jobs:24h:push"
        )
      : unmeasuredRate("jobs:24h:push");
  const emailRate = unmeasuredRate("notifications:email"); // no channel metric yet
  const notifyEvidence = evidenceCategoryRate(
    evidence,
    ["notification"],
    "evidence:notification"
  );
  const notificationSuccess = mergePreferMeasured(notifyRel, notifyEvidence);

  // Storage — download from reliability + word; upload/signed URL unmeasured
  const downloadRel = rateFromBucket(
    window.buckets.deliverable_download,
    `reliability:${windowDays}d:deliverable_download`
  );
  const downloadWord =
    word.downloadSuccesses + word.downloadFailures > 0
      ? measuredRate(
          word.downloadSuccesses,
          word.downloadFailures,
          "word-metrics:download"
        )
      : unmeasuredRate("word-metrics:download");
  const downloadEvidence = evidenceCategoryRate(
    evidence,
    ["download"],
    "evidence:download"
  );
  const downloadSuccess = mergePreferMeasured(
    mergePreferMeasured(downloadRel, downloadWord),
    downloadEvidence
  );
  const uploadSuccess = unmeasuredRate("storage:upload");
  const signedUrlSuccess = unmeasuredRate("storage:signed_url");
  const zeroByteRate = unmeasuredRate("storage:zero_byte");
  // Gate uses download as the only currently instrumented storage path.
  // Upload/signed-URL remain unmeasured and must not be faked as 100%.
  const storageSuccess = downloadSuccess.measured
    ? downloadSuccess
    : unmeasuredRate("storage:combined");

  // System
  const mem = process.memoryUsage();
  const memoryMb = Math.round(mem.rss / (1024 * 1024));
  const apiLatency = latencyFromBucket(
    window.buckets.deliverable_generate,
    `reliability:${windowDays}d:deliverable_generate`
  );
  const errorRate =
    genBucket && genBucket.success + genBucket.failure > 0
      ? ratioRate(
          genBucket.failure,
          genBucket.success + genBucket.failure,
          `reliability:${windowDays}d:error`
        )
      : unmeasuredRate("system:error_rate");

  const criticalFindings = [
    ...collectStaticCriticalFindings({
      productionNotVerified: !productionE2eVerified,
      // Vision timeout mitigation code exists; only flag if runtime rate high
      visionTimeoutUnmitigated: false,
      billingGapsOpen: true,
      authzGlobalStores: true,
    }),
    ...collectRuntimeCriticalFindings({
      stuckJobs: jobMetrics.hung,
      visionTimeoutRate: openaiTimeoutRate.measured
        ? openaiTimeoutRate.rate
        : null,
      visionTimeoutSampleSize: openaiTimeoutRate.total,
      corruptArtifactEvents:
        word.verifyFailures > 0 ? word.verifyFailures : 0,
    }),
  ];

  const gateRates = {
    wordSuccessRate: wordRate,
    excelSuccessRate: excelRate,
    pdfSuccessRate: pdfRate,
    powerpointSuccessRate: powerpointRate,
    visionSuccessRate: visionEvidence,
    notificationSuccessRate: notificationSuccess,
    storageSuccessRate: storageSuccess,
    jobSuccessRate: jobCompletedRate,
  };

  const gates = evaluateQualityGates({
    rates: gateRates,
    criticalFindings,
    evidence,
    productionE2eVerified,
  });

  const sections: QualityMetricSection[] = [
    {
      id: "ai",
      title: "AI",
      metrics: [
        { id: "intent_success", label: "Intent判定成功率", value: ai.intentSuccess },
        { id: "format_success", label: "Format判定成功率", value: ai.formatSuccess },
        { id: "vision_success", label: "Vision成功率", value: visionEvidence },
        { id: "ocr_success", label: "OCR成功率", value: ocrEvidence },
        {
          id: "avg_confidence",
          label: "平均Confidence",
          value:
            ai.avgConfidence != null
              ? {
                  rate: ai.avgConfidence,
                  success: 0,
                  failure: 0,
                  total: ai.caseCount,
                  measured: true,
                  source: "request-understanding:confidence",
                }
              : unmeasuredRate("request-understanding:confidence"),
        },
        { id: "fallback_rate", label: "Fallback率", value: ai.fallbackRate },
        {
          id: "misclassification_rate",
          label: "誤分類率",
          value: ai.misclassificationRate,
        },
      ],
    },
    {
      id: "deliverables",
      title: "成果物",
      metrics: [
        { id: "word_success", label: "Word成功率", value: wordRate, latency: avgGenerateMs },
        { id: "excel_success", label: "Excel成功率", value: excelRate },
        { id: "pdf_success", label: "PDF成功率", value: pdfRate },
        { id: "powerpoint_success", label: "PowerPoint成功率", value: powerpointRate },
        { id: "csv_success", label: "CSV成功率", value: csvRate },
        {
          id: "avg_generate_ms",
          label: "平均生成時間",
          value: avgGenerateMs.measured
            ? {
                rate: null,
                success: avgGenerateMs.sampleCount,
                failure: 0,
                total: avgGenerateMs.sampleCount,
                measured: true,
                source: avgGenerateMs.source,
              }
            : unmeasuredRate("avg_generate_ms"),
          latency: avgGenerateMs,
          note: avgGenerateMs.avgMs != null ? `${Math.round(avgGenerateMs.avgMs)} ms` : null,
        },
        { id: "failure_rate", label: "失敗率", value: deliverableFailure },
        { id: "retry_rate", label: "リトライ率", value: retryRate },
        { id: "corrupt_rate", label: "成果物破損率", value: corruptRate },
      ],
    },
    {
      id: "vision",
      title: "Vision",
      metrics: [
        {
          id: "openai_timeout_rate",
          label: "OpenAI timeout率",
          value: openaiTimeoutRate,
        },
        { id: "ocr_success", label: "OCR成功率", value: ocrEvidence },
        { id: "analyze_success", label: "画像解析成功率", value: visionEvidence },
        {
          id: "vision_avg_ms",
          label: "平均解析時間",
          value: visionPhase1Rates.latency.measured
            ? {
                rate: null,
                success: visionPhase1Rates.latency.sampleCount,
                failure: 0,
                total: visionPhase1Rates.latency.sampleCount,
                measured: true,
                source: visionPhase1Rates.latency.source,
              }
            : unmeasuredRate("vision:avg_ms"),
          latency: visionPhase1Rates.latency,
          note:
            visionPhase1Rates.latency.avgMs != null
              ? `${Math.round(visionPhase1Rates.latency.avgMs)} ms`
              : null,
        },
        {
          id: "vision_p95",
          label: "95パーセンタイル",
          value:
            visionPhase1Rates.p95Ms != null
              ? {
                  rate: null,
                  success: 1,
                  failure: 0,
                  total: 1,
                  measured: true,
                  source: "vision-phase1:p95",
                }
              : unmeasuredRate("vision:p95"),
          note:
            visionPhase1Rates.p95Ms != null
              ? `${Math.round(visionPhase1Rates.p95Ms)} ms`
              : null,
        },
        {
          id: "avg_image_bytes",
          label: "平均画像サイズ",
          value: unmeasuredRate("vision:avg_image_bytes"),
        },
        {
          id: "avg_page_count",
          label: "平均ページ数",
          value: unmeasuredRate("vision:avg_page_count"),
        },
        {
          id: "abort_rate",
          label: "Abort率",
          value: unmeasuredRate("vision:abort"),
        },
      ],
    },
    {
      id: "jobs",
      title: "ジョブ",
      metrics: [
        { id: "job_completed", label: "Completed率", value: jobCompletedRate },
        { id: "job_failed", label: "Failed率", value: jobFailedRate },
        { id: "job_retry", label: "Retry率", value: jobRetryRate },
        { id: "job_needs_input", label: "NeedsInput率", value: needsInputRate },
        {
          id: "job_avg_duration",
          label: "平均実行時間",
          value: unmeasuredRate("jobs:avg_duration"),
          latency: latencyFromBucket(
            window.buckets.work_job,
            `reliability:${windowDays}d:work_job`
          ),
        },
        {
          id: "job_avg_wait",
          label: "平均待機時間",
          value: unmeasuredRate("jobs:avg_wait"),
        },
        {
          id: "queue_depth",
          label: "キュー数",
          value:
            jobTotal > 0
              ? {
                  rate: null,
                  success: jobMetrics.retrying,
                  failure: 0,
                  total: jobTotal,
                  measured: true,
                  source: "jobs:24h:queue_proxy",
                }
              : unmeasuredRate("jobs:queue"),
          note: `retrying=${jobMetrics.retrying} hung=${jobMetrics.hung}`,
        },
      ],
    },
    {
      id: "notifications",
      title: "通知",
      metrics: [
        {
          id: "notification_success",
          label: "通知成功率",
          value: notificationSuccess,
        },
        { id: "push_success", label: "Push成功率", value: pushRate },
        { id: "email_success", label: "メール成功率", value: emailRate },
        {
          id: "notification_delay",
          label: "通知遅延",
          value: unmeasuredRate("notifications:delay"),
          latency: unmeasuredLatency("notifications:delay"),
        },
      ],
    },
    {
      id: "storage",
      title: "Storage",
      metrics: [
        { id: "upload_success", label: "Upload成功率", value: uploadSuccess },
        {
          id: "download_success",
          label: "Download成功率",
          value: downloadSuccess,
        },
        {
          id: "signed_url_success",
          label: "署名URL成功率",
          value: signedUrlSuccess,
        },
        { id: "zero_byte_rate", label: "0byte率", value: zeroByteRate },
      ],
    },
    {
      id: "system",
      title: "システム",
      metrics: [
        {
          id: "cpu",
          label: "CPU",
          value: unmeasuredRate("system:cpu"),
          note: "ホストCPU%はサーバーレスでは未提供",
        },
        {
          id: "memory",
          label: "Memory",
          value: {
            rate: null,
            success: memoryMb,
            failure: 0,
            total: memoryMb,
            measured: true,
            source: "process.memoryUsage().rss",
          },
          note: `${memoryMb} MB RSS`,
        },
        {
          id: "cold_start",
          label: "Cold Start",
          value: unmeasuredRate("system:cold_start"),
        },
        {
          id: "api_latency",
          label: "API応答",
          value: unmeasuredRate("system:api"),
          latency: apiLatency,
        },
        { id: "error_rate", label: "Error Rate", value: errorRate },
      ],
    },
  ];

  const measuredRates: Record<string, number | null> = {
    word: wordRate.rate,
    excel: excelRate.rate,
    pdf: pdfRate.rate,
    powerpoint: powerpointRate.rate,
    vision: visionEvidence.rate,
    notification: notificationSuccess.rate,
    storage: storageSuccess.rate,
    job: jobCompletedRate.rate,
    intent: ai.intentSuccess.rate,
    format: ai.formatSuccess.rate,
  };

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    sections,
    ai: {
      intentSuccess: ai.intentSuccess,
      formatSuccess: ai.formatSuccess,
      visionSuccess: visionEvidence,
      ocrSuccess: ocrEvidence,
      avgConfidence: ai.avgConfidence,
      fallbackRate: ai.fallbackRate,
      misclassificationRate: ai.misclassificationRate,
    },
    deliverables: {
      word: wordRate,
      excel: excelRate,
      pdf: pdfRate,
      powerpoint: powerpointRate,
      csv: csvRate,
      avgGenerateMs,
      failureRate: deliverableFailure,
      retryRate,
      corruptRate,
    },
    vision: {
      openaiTimeoutRate,
      ocrSuccess: ocrEvidence,
      analyzeSuccess: visionEvidence,
      avgMs: visionPhase1Rates.latency,
      p95Ms: visionPhase1Rates.p95Ms,
      avgImageBytes: null,
      avgPageCount: null,
      abortRate: unmeasuredRate("vision:abort"),
    },
    jobs: {
      completedRate: jobCompletedRate,
      failedRate: jobFailedRate,
      retryRate: jobRetryRate,
      needsInputRate,
      avgDurationMs: latencyFromBucket(
        window.buckets.work_job,
        `reliability:${windowDays}d:work_job`
      ),
      avgWaitMs: unmeasuredLatency("jobs:avg_wait"),
      queueDepth: jobMetrics.retrying,
    },
    notifications: {
      successRate: notificationSuccess,
      pushSuccessRate: pushRate,
      emailSuccessRate: emailRate,
      delayMs: unmeasuredLatency("notifications:delay"),
    },
    storage: {
      uploadSuccess,
      downloadSuccess,
      signedUrlSuccess,
      zeroByteRate,
    },
    system: {
      cpu: null,
      memoryMb,
      coldStartMs: null,
      apiLatencyMs: apiLatency,
      errorRate,
    },
    evidence,
    criticalFindings,
    gates,
    releaseReady: gates.releaseReady,
    productionE2eVerified,
    beforeAfter: {
      note: "前回の自己採点は改善方針としてのみ有効。現在値は実測/未計測のみ。",
      previousSelfScores: {
        aiQuality: 88,
        ux: 82,
        deliverableQuality: 80,
      },
      measuredRates,
    },
  };
}
