import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

import { aggregateVisionEval } from "@/lib/vision-eval/aggregate";
import {
  assertVisionEvalCaseCounts,
  VISION_EVAL_CASES,
} from "@/lib/vision-eval/cases";
import { inspectVisionEvalEnv } from "@/lib/vision-eval/env-check";
import {
  FAULT_SCENARIOS,
  runFaultScenario,
} from "@/lib/vision-eval/fault-injection";
import { generateVisionEvalImages } from "@/lib/vision-eval/generate-images";
import { runLiveVisionCase } from "@/lib/vision-eval/run-live-case";
import type {
  VisionCaseRunResult,
  VisionEvalAggregate,
} from "@/lib/vision-eval/types";

export const DEFAULT_VISION_EVAL_OUT =
  process.env.VISION_EVAL_OUT?.trim() ||
  "/opt/cursor/artifacts/vision-phase1";

export type VisionPhase1SuiteResult = {
  suiteId: string;
  env: ReturnType<typeof inspectVisionEvalEnv>;
  results: VisionCaseRunResult[];
  faultResults: Array<Awaited<ReturnType<typeof runFaultScenario>>>;
  aggregate: VisionEvalAggregate;
  outDir: string;
  reportPath: string;
  beforeAfterPath: string;
};

function writeCaseEvidence(
  outDir: string,
  result: VisionCaseRunResult,
  expected: unknown
): string {
  const dir = join(outDir, "cases", result.caseId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "result.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        expected,
        result: {
          ...result,
          // never persist image bytes
        },
      },
      null,
      2
    ),
    "utf8"
  );
  writeFileSync(join(dir, "log.txt"), result.log.join("\n"), "utf8");
  return path;
}

/**
 * Phase1 Vision/OCR measurement suite.
 * Live OpenAI only when QUALITY_LIVE_VISION=1 and OPENAI_API_KEY set.
 * Never mocks success.
 */
export async function runVisionPhase1Suite(options?: {
  outDir?: string;
  limit?: number;
  generateArtifactsFor?: number;
}): Promise<VisionPhase1SuiteResult> {
  const env = inspectVisionEvalEnv();
  const suiteId = `vphase1_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
  const outDir = join(options?.outDir ?? DEFAULT_VISION_EVAL_OUT, suiteId);
  mkdirSync(outDir, { recursive: true });

  assertVisionEvalCaseCounts(VISION_EVAL_CASES);
  const cases = VISION_EVAL_CASES.slice(0, options?.limit ?? VISION_EVAL_CASES.length);
  writeFileSync(
    join(outDir, "env-report.json"),
    JSON.stringify(
      {
        ...env,
        // never include secret values
      },
      null,
      2
    ),
    "utf8"
  );
  writeFileSync(join(outDir, "setup-steps.txt"), env.setupSteps.join("\n"), "utf8");

  const images = await generateVisionEvalImages(cases, outDir);
  writeFileSync(
    join(outDir, "images-manifest.json"),
    JSON.stringify(images, null, 2),
    "utf8"
  );

  const results: VisionCaseRunResult[] = [];
  const artifactBudget = options?.generateArtifactsFor ?? 12;

  if (!env.canRunLocalLiveProvider) {
    for (const c of cases) {
      const startedAt = new Date().toISOString();
      const result: VisionCaseRunResult = {
        caseId: c.caseId,
        category: c.category,
        ok: false,
        ocrOk: false,
        requestId: `blocked_${c.caseId}`,
        jobId: null,
        diagnosticId: null,
        openAiRequestId: null,
        httpStatus: null,
        startedAt,
        finishedAt: new Date().toISOString(),
        // Not a measured duration — API was not invoked.
        totalMs: Number.NaN,
        visionMs: null,
        retryCount: 0,
        finalStatus: "env_blocked",
        failedStage: null,
        developerCode: "env_missing",
        userCode: null,
        timedOut: false,
        analysis: null,
        artifactGenerated: false,
        artifactFormats: [],
        failureClass: "env_missing",
        failureReason: env.blockers.join("; "),
        score: {
          fieldHitRate: 0,
          readableHitRate: 0,
          typeOk: false,
          // schema not evaluated without API response
          schemaOk: true,
        },
        environment: "local-live",
        log: ["blocked: live OpenAI not enabled", ...env.blockers],
        screenshotPath: null,
        evidencePath: null,
      };
      result.evidencePath = writeCaseEvidence(outDir, result, c);
      results.push(result);
    }
  } else {
    let artifactCount = 0;
    for (const c of cases) {
      const result = await runLiveVisionCase(c, {
        fixtureDir: outDir,
        generateArtifact: artifactCount < artifactBudget,
        environment: "local-live",
      });
      if (result.artifactGenerated || result.log.some((l) => l.startsWith("artifact"))) {
        artifactCount += 1;
      }
      result.evidencePath = writeCaseEvidence(outDir, result, {
        caseId: c.caseId,
        category: c.category,
        expectedDocumentType: c.expectedDocumentType,
        expectedFields: c.expectedFields,
        expectedReadable: c.expectedReadable,
      });
      results.push(result);
      // gentle pacing against rate limits
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  const faultResults = [];
  for (const id of FAULT_SCENARIOS) {
    const fr = await runFaultScenario(id);
    writeCaseEvidence(outDir, fr, { scenario: id });
    faultResults.push(fr);
  }

  const aggregate = aggregateVisionEval(cases, results);
  const reportPath = join(outDir, "PHASE1_REPORT.md");
  const beforeAfterPath = join(outDir, "BEFORE_AFTER.md");

  const lines = [
    "# Vision/OCR Phase 1 Evidence Report",
    "",
    `suiteId: ${suiteId}`,
    `generatedAt: ${new Date().toISOString()}`,
    "",
    "## 1. 実行環境",
    "",
    `- OPENAI_API_KEY: ${env.openaiApiKey ? "SET" : "MISSING"}`,
    `- QUALITY_LIVE_VISION: ${env.qualityLiveVision}`,
    `- PRODUCTION_E2E_BASE_URL: ${env.productionE2eBaseUrl ?? "unset"}`,
    `- production URL (guess): ${env.productionUrlGuess}`,
    `- canRunLocalLiveProvider: ${env.canRunLocalLiveProvider}`,
    `- canRunProductionHttp: ${env.canRunProductionHttp}`,
    `- OCR構成: Vision内部（extractedText/fields/tables）。独立OCR APIなし`,
    "",
    "### Blockers",
    ...env.blockers.map((b) => `- ${b}`),
    "",
    "### Setup",
    ...env.setupSteps.map((s) => `- ${s}`),
    "",
    "## 2. 評価セット",
    "",
    `- cases: ${cases.length}`,
    `- unique images: ${images.length}`,
    "",
    "## 3–9. 実測",
    "",
    `| Metric | Value | n |`,
    `| --- | --- | --- |`,
    `| Vision成功率 | ${fmt(aggregate.visionSuccessRate)} | ${aggregate.totalCases} |`,
    `| OCR成功率 | ${fmt(aggregate.ocrSuccessRate)} | ${aggregate.totalCases} |`,
    `| 平均ms | ${aggregate.avgMs?.toFixed(0) ?? "未計測"} | ${aggregate.totalCases} |`,
    `| median | ${aggregate.medianMs?.toFixed(0) ?? "未計測"} | |`,
    `| p90 | ${aggregate.p90Ms?.toFixed(0) ?? "未計測"} | |`,
    `| p95 | ${aggregate.p95Ms?.toFixed(0) ?? "未計測"} | |`,
    `| p99 | ${aggregate.p99Ms?.toFixed(0) ?? "未計測"} | |`,
    `| timeout率 | ${fmt(aggregate.timeoutRate)} | |`,
    `| retry率 | ${fmt(aggregate.retryRate)} | |`,
    `| retry成功率 | ${fmt(aggregate.retrySuccessRate)} | |`,
    `| needs_input率 | ${fmt(aggregate.needsInputRate)} | |`,
    `| schema失敗率 | ${fmt(aggregate.schemaFailureRate)} | |`,
    `| 成果物生成率 | ${fmt(aggregate.artifactGenerationRate)} | |`,
    "",
    "### category別",
    "",
    ...Object.entries(aggregate.categoryRates).map(
      ([k, v]) => `- ${k}: ${fmt(v.rate)} (${v.success}/${v.total})`
    ),
    "",
    "### 失敗原因ランキング",
    "",
    ...aggregate.failureRanking.map((f) => `- ${f.class}: ${f.count}`),
    "",
    "### OCR相当",
    "",
    `- note: ${aggregate.ocr.note}`,
    `- charExtract: ${fmt(aggregate.ocr.charExtractSuccessRate)}`,
    `- digit: ${fmt(aggregate.ocr.digitRecognitionRate)}`,
    `- date: ${fmt(aggregate.ocr.dateRecognitionRate)}`,
    `- amount: ${fmt(aggregate.ocr.amountRecognitionRate)}`,
    `- japanese: ${fmt(aggregate.ocr.japaneseRecognitionRate)}`,
    `- alnum: ${fmt(aggregate.ocr.alnumRecognitionRate)}`,
    `- table: ${fmt(aggregate.ocr.tableStructureRate)}`,
    `- CER: ${aggregate.ocr.charErrorRate?.toFixed(4) ?? "未計測"}`,
    `- conf↔acc相関: ${aggregate.ocr.confidenceCorrelation?.toFixed(4) ?? "未計測"}`,
    "",
    "## Fault injection (controlled, no prod harm)",
    "",
    ...faultResults.map(
      (f) => `- ${f.scenarioId}: ${f.pass ? "PASS" : "FAIL"} status=${f.finalStatus}`
    ),
    "",
    "## request_id 一覧（先頭50）",
    "",
    ...results.slice(0, 50).map((r) => `- ${r.caseId}: \`${r.requestId}\` ok=${r.ok}`),
    "",
    "## Phase 1 判定",
    "",
    `**${aggregate.phase1Pass ? "PASS" : "FAIL"}**`,
    "",
    ...aggregate.phase1FailReasons.map((r) => `- ${r}`),
    "",
  ];
  writeFileSync(reportPath, lines.join("\n"), "utf8");

  writeFileSync(
    beforeAfterPath,
    [
      "# Before / After",
      "",
      "## Before (previous evidence suite)",
      "- Vision: 0.00% (n=1, API未実行=FAIL)",
      "- OCR: 0.00% (n=1, 未計測=FAIL)",
      "- 本番スクショ: なし",
      "- p95: 未計測",
      "",
      "## After (this suite)",
      `- Vision: ${fmt(aggregate.visionSuccessRate)} (n=${aggregate.totalCases})`,
      `- OCR: ${fmt(aggregate.ocrSuccessRate)} (n=${aggregate.totalCases})`,
      `- p95: ${aggregate.p95Ms?.toFixed(0) ?? "未計測"} ms`,
      `- live provider enabled: ${env.canRunLocalLiveProvider}`,
      `- phase1: ${aggregate.phase1Pass ? "PASS" : "FAIL"}`,
      "",
    ].join("\n"),
    "utf8"
  );

  writeFileSync(
    join(outDir, "aggregate.json"),
    JSON.stringify({ suiteId, aggregate, faultResults }, null, 2),
    "utf8"
  );
  writeFileSync(
    join(outDir, "results.json"),
    JSON.stringify(results, null, 2),
    "utf8"
  );

  // latest pointer
  writeFileSync(
    join(options?.outDir ?? DEFAULT_VISION_EVAL_OUT, "latest.json"),
    JSON.stringify(
      {
        suiteId,
        reportPath,
        phase1Pass: aggregate.phase1Pass,
        visionSuccessRate: aggregate.visionSuccessRate,
        n: aggregate.totalCases,
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    suiteId,
    env,
    results,
    faultResults,
    aggregate,
    outDir,
    reportPath,
    beforeAfterPath,
  };
}

function fmt(rate: number | null | undefined): string {
  if (rate == null) return "未計測";
  return `${(rate * 100).toFixed(2)}%`;
}
