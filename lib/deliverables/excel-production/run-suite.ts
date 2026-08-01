import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import {
  addDeliverableVersion,
  createVersionGroup,
  resetDeliverableVersionsForTests,
} from "@/lib/deliverables/versioning";

import { buildExcelProductionCases } from "./cases";
import { verifyCsvExcelRoundtrip } from "./csv-roundtrip";
import { verifyExcelPdfParity } from "./excel-pdf-parity";
import { EXCEL_PRODUCTION_FEATURE_EVALUATION } from "./feature-evaluation";
import { REQUIRED_FORMULA_NAMES } from "./formulas";
import { inspectXlsxProduction } from "./xlsx-quality";

export type ExcelProductionSuiteReport = {
  suiteId: string;
  generatedAt: string;
  featureEvaluation: typeof EXCEL_PRODUCTION_FEATURE_EVALUATION;
  n: number;
  success: number;
  corrupt: number;
  successRate: number;
  corruptRate: number;
  avgMs: number;
  p95Ms: number;
  revisionOk: boolean;
  parityOk: boolean;
  csvOk: boolean;
  formulaCatalogOk: boolean;
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
  return "/opt/cursor/artifacts/excel-production";
}

/**
 * Run production durability suite (n≥100) with OpenXML / revision / CSV / PDF parity.
 */
export async function runExcelProductionSuite(): Promise<ExcelProductionSuiteReport> {
  const cases = buildExcelProductionCases();
  const gen = new XlsxDeliverableGenerator();
  const failures: ExcelProductionSuiteReport["failures"] = [];
  const times: number[] = [];
  let success = 0;
  let corrupt = 0;

  const suiteId = `excelprod_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23)}_${Math.random().toString(16).slice(2, 10)}`;
  const outDir = join(artifactRoot(), suiteId);
  mkdirSync(outDir, { recursive: true });

  for (const c of cases) {
    const started = Date.now();
    try {
      const file = await gen.generate(c.content, c.fileName, {
        assignment: c.assignment,
      });
      const ms = Date.now() - started;
      times.push(ms);
      const report = inspectXlsxProduction(file.buffer);
      if (!report.ok || report.zeroByte) {
        corrupt += 1;
        failures.push({ id: c.id, reasons: report.reasons, ms });
        continue;
      }
      if (c.expectFormulas && report.formulaCount < REQUIRED_FORMULA_NAMES.length) {
        failures.push({
          id: c.id,
          reasons: [`formula_count:${report.formulaCount}`],
          ms,
        });
        continue;
      }
      if (c.expectCharts && report.chartCount < 1) {
        failures.push({
          id: c.id,
          reasons: ["chart_missing"],
          ms,
        });
        continue;
      }
      success += 1;
      if (success <= 5) {
        writeFileSync(join(outDir, `${c.id}.xlsx`), file.buffer);
      }
    } catch (error) {
      const ms = Date.now() - started;
      times.push(ms);
      corrupt += 1;
      failures.push({
        id: c.id,
        reasons: [
          error instanceof Error ? error.message : "generate_failed",
        ],
        ms,
      });
    }
  }

  // Revision: original buffer immutable + new version id
  resetDeliverableVersionsForTests();
  const v1content = cases[0]!.content;
  const v1 = await gen.generate(v1content, "revision_v1", {
    assignment: cases[0]!.assignment,
  });
  const v1sha = inspectXlsxProduction(v1.buffer).sha256;
  const group = createVersionGroup({
    deliverableId: "excel_rev_1",
    createdBy: "excel-production-suite",
    displayName: "revision_v1.xlsx",
    internalFileName: "revision_v1.xlsx",
    jobId: null,
  });
  const v2content = `${v1content}\n\n## 追加シート\n\n| 追加列 | 追加値 |\n| --- | --- |\n| 追加行 | 999 |\n| グラフ用 | 1000 |`;
  const v2 = await gen.generate(v2content, "revision_v2", {
    assignment: "列追加・行追加・数式変更・グラフ追加・シート追加",
  });
  addDeliverableVersion({
    groupId: group.groupId,
    newDeliverableId: "excel_rev_2",
    parentDeliverableId: "excel_rev_1",
    createdBy: "excel-production-suite",
    displayName: "revision_v2.xlsx",
    internalFileName: "revision_v2.xlsx",
    revisionReason: "列追加・行追加",
    jobId: null,
    diffSummary: "rows+cols",
  });
  const v1shaAfter = inspectXlsxProduction(v1.buffer).sha256;
  const v2Report = inspectXlsxProduction(v2.buffer);
  const revisionOk =
    v1sha === v1shaAfter &&
    v2Report.ok &&
    v1sha !== v2Report.sha256 &&
    group.groupId.length > 0 &&
    v2.buffer.byteLength > 0;

  const csvCase = cases.find((c) => c.category === "CSV") ?? cases[0]!;
  const csv = await verifyCsvExcelRoundtrip(csvCase.content, async (content) => {
    const file = await gen.generate(content, "csv_roundtrip", {
      assignment: "CSVをExcelへ",
    });
    return file.buffer;
  });

  const paritySample = cases.find((c) => c.category === "家計簿") ?? cases[0]!;
  const parityFile = await gen.generate(paritySample.content, "parity", {
    assignment: paritySample.assignment,
  });
  const parity = await verifyExcelPdfParity({
    content: paritySample.content,
    xlsxBuffer: parityFile.buffer,
  });

  const formulaFile = await gen.generate(
    cases.find((c) => c.id === "formula_catalog")!.content,
    "formula_catalog",
    { assignment: "数式検証" },
  );
  const formulaReport = inspectXlsxProduction(formulaFile.buffer);
  const formulaCatalogOk =
    formulaReport.ok &&
    formulaReport.formulaCount >= REQUIRED_FORMULA_NAMES.length &&
    formulaReport.brokenFormulaMarkers === 0;

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
    csv.ok &&
    parity.ok &&
    formulaCatalogOk &&
    failures.length === 0;

  const reportPath = join(outDir, "EXCEL_PRODUCTION_FINAL.md");
  const latestPath = join(artifactRoot(), "latest.json");
  const report: ExcelProductionSuiteReport = {
    suiteId,
    generatedAt: new Date().toISOString(),
    featureEvaluation: EXCEL_PRODUCTION_FEATURE_EVALUATION,
    n,
    success,
    corrupt,
    successRate,
    corruptRate,
    avgMs,
    p95Ms,
    revisionOk,
    parityOk: parity.ok,
    csvOk: csv.ok,
    formulaCatalogOk,
    phasePass,
    failures,
    reportPath,
  };

  const md = [
    "# Excel Production Ready — FINAL",
    "",
    `suiteId: ${suiteId}`,
    `phasePass: ${phasePass}`,
    "",
    `n=${n} successRate=${successRate} corruptRate=${corruptRate}`,
    `avgMs=${avgMs} p95Ms=${p95Ms}`,
    `revisionOk=${revisionOk} parityOk=${parity.ok} csvOk=${csv.ok} formulaCatalogOk=${formulaCatalogOk}`,
    "",
    "## Failures",
    failures.length === 0
      ? "- none"
      : failures.map((f) => `- ${f.id}: ${f.reasons.join(", ")}`).join("\n"),
    "",
    "## CSV",
    JSON.stringify(csv.reasons),
    "",
    "## Parity",
    JSON.stringify(parity),
  ].join("\n");

  writeFileSync(reportPath, md, "utf8");
  writeFileSync(latestPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(artifactRoot(), "EXCEL_PRODUCTION_FINAL.md"), md, "utf8");

  return report;
}
