import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import {
  addDeliverableVersion,
  createVersionGroup,
  resetDeliverableVersionsForTests,
} from "@/lib/deliverables/versioning";

import { buildPptxProductionCases } from "./cases";
import { verifyExcelPptxParity } from "./excel-pptx-parity";
import { PPTX_PRODUCTION_FEATURE_EVALUATION } from "./feature-evaluation";
import { inspectPptxProduction } from "./pptx-inspect";
import { verifyPptxPdfParity } from "./pptx-pdf-parity";
import { verifyWordPptxParity } from "./word-pptx-parity";

export type PptxProductionSuiteReport = {
  suiteId: string;
  generatedAt: string;
  featureEvaluation: typeof PPTX_PRODUCTION_FEATURE_EVALUATION;
  n: number;
  success: number;
  corrupt: number;
  successRate: number;
  corruptRate: number;
  avgMs: number;
  p95Ms: number;
  revisionOk: boolean;
  wordParityOk: boolean;
  excelParityOk: boolean;
  pdfParityOk: boolean;
  phasePass: boolean;
  failures: Array<{ id: string; reasons: string[]; ms: number }>;
  reportPath: string;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

function artifactRoot(): string {
  return "/opt/cursor/artifacts/pptx-production";
}

export async function runPptxProductionSuite(): Promise<PptxProductionSuiteReport> {
  const cases = buildPptxProductionCases();
  const gen = new PptxDeliverableGenerator();
  const failures: PptxProductionSuiteReport["failures"] = [];
  const times: number[] = [];
  let success = 0;
  let corrupt = 0;

  const suiteId = `pptxprod_${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 23)}_${Math.random().toString(16).slice(2, 10)}`;
  const outDir = join(artifactRoot(), suiteId);
  mkdirSync(outDir, { recursive: true });

  for (const c of cases) {
    const started = Date.now();
    try {
      const file = await gen.generate(c.content, c.fileName, {
        aspectRatio: c.aspectRatio ?? "16:9",
      });
      const ms = Date.now() - started;
      times.push(ms);
      const report = inspectPptxProduction(file.buffer);
      if (!report.ok || report.zeroByte) {
        corrupt += 1;
        failures.push({ id: c.id, reasons: report.reasons, ms });
        continue;
      }
      if (c.expectTables && report.tableHintCount < 1) {
        failures.push({ id: c.id, reasons: ["table_missing"], ms });
        continue;
      }
      if (c.expectCharts && report.chartCount < 1) {
        failures.push({ id: c.id, reasons: ["chart_missing"], ms });
        continue;
      }
      if (c.expectImages && report.imageCount < 1) {
        failures.push({ id: c.id, reasons: ["image_missing"], ms });
        continue;
      }
      success += 1;
      if (success <= 5) {
        writeFileSync(join(outDir, `${c.id}.pptx`), file.buffer);
      }
    } catch (error) {
      const ms = Date.now() - started;
      times.push(ms);
      corrupt += 1;
      failures.push({
        id: c.id,
        reasons: [error instanceof Error ? error.message : "generate_failed"],
        ms,
      });
    }
  }

  resetDeliverableVersionsForTests();
  const v1content = cases[0]!.content;
  const v1 = await gen.generate(v1content, "revision_v1");
  const v1sha = inspectPptxProduction(v1.buffer).sha256;
  const group = createVersionGroup({
    deliverableId: "pptx_rev_1",
    createdBy: "pptx-production-suite",
    displayName: "revision_v1.pptx",
    internalFileName: "revision_v1.pptx",
    jobId: null,
  });
  const v2content = `${v1content}\n\n## 追記スライド\n\n- 追加ポイント\n\n${"| 追加 | 値 |\n| --- | --- |\n| X | 99 |"}`;
  const v2 = await gen.generate(v2content, "revision_v2");
  addDeliverableVersion({
    groupId: group.groupId,
    newDeliverableId: "pptx_rev_2",
    parentDeliverableId: "pptx_rev_1",
    createdBy: "pptx-production-suite",
    displayName: "revision_v2.pptx",
    internalFileName: "revision_v2.pptx",
    revisionReason: "スライド追加",
    jobId: null,
    diffSummary: "slides+",
  });
  const v1shaAfter = inspectPptxProduction(v1.buffer).sha256;
  const v2Report = inspectPptxProduction(v2.buffer);
  const revisionOk =
    v1sha === v1shaAfter &&
    v2Report.ok &&
    v1sha !== v2Report.sha256 &&
    group.groupId.length > 0;

  const wordParity = await verifyWordPptxParity(
    cases.find((c) => c.category === "企画書")!.content,
  );
  const excelParity = await verifyExcelPptxParity(
    cases.find((c) => c.expectTables)!.content,
  );
  const pdfParity = await verifyPptxPdfParity(
    cases.find((c) => c.category === "営業資料")!.content,
  );

  const sorted = [...times].sort((a, b) => a - b);
  const avgMs =
    times.length === 0
      ? 0
      : Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) /
        100;
  const p95Ms = percentile(sorted, 95);
  const n = cases.length;
  const successRate = n === 0 ? 0 : success / n;
  const corruptRate = n === 0 ? 0 : corrupt / n;
  const phasePass =
    successRate === 1 &&
    corruptRate === 0 &&
    revisionOk &&
    wordParity.ok &&
    excelParity.ok &&
    pdfParity.ok &&
    failures.length === 0;

  const reportPath = join(outDir, "PPTX_PRODUCTION_FINAL.md");
  const report: PptxProductionSuiteReport = {
    suiteId,
    generatedAt: new Date().toISOString(),
    featureEvaluation: PPTX_PRODUCTION_FEATURE_EVALUATION,
    n,
    success,
    corrupt,
    successRate,
    corruptRate,
    avgMs,
    p95Ms,
    revisionOk,
    wordParityOk: wordParity.ok,
    excelParityOk: excelParity.ok,
    pdfParityOk: pdfParity.ok,
    phasePass,
    failures,
    reportPath,
  };

  const md = [
    "# PowerPoint Production Ready — FINAL",
    "",
    `suiteId: ${suiteId}`,
    `phasePass: ${phasePass}`,
    "",
    `n=${n} successRate=${successRate} corruptRate=${corruptRate}`,
    `avgMs=${avgMs} p95Ms=${p95Ms}`,
    `revisionOk=${revisionOk} wordParityOk=${wordParity.ok} excelParityOk=${excelParity.ok} pdfParityOk=${pdfParity.ok}`,
    "",
    "## Failures",
    failures.length === 0
      ? "- none"
      : failures.map((f) => `- ${f.id}: ${f.reasons.join(", ")}`).join("\n"),
  ].join("\n");

  writeFileSync(reportPath, md, "utf8");
  writeFileSync(
    join(artifactRoot(), "latest.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  writeFileSync(join(artifactRoot(), "PPTX_PRODUCTION_FINAL.md"), md, "utf8");

  return report;
}
