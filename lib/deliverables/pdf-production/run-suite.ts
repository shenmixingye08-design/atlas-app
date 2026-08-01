import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { verifyPdfQuality } from "@/lib/deliverables/pdf-quality";
import {
  addDeliverableVersion,
  createVersionGroup,
  resetDeliverableVersionsForTests,
} from "@/lib/deliverables/versioning";

import { buildPdfProductionCases } from "./cases";
import { verifyExcelPdfParity } from "./excel-pdf-parity";
import { PDF_PRODUCTION_FEATURE_EVALUATION } from "./feature-evaluation";
import { inspectPdfProduction } from "./pdf-inspect";
import { verifyWordPdfParity } from "./word-pdf-parity";

export type PdfProductionSuiteReport = {
  suiteId: string;
  generatedAt: string;
  featureEvaluation: typeof PDF_PRODUCTION_FEATURE_EVALUATION;
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
  return "/opt/cursor/artifacts/pdf-production";
}

/**
 * Run production durability suite (n≥100) with structure / parity / revision checks.
 */
export async function runPdfProductionSuite(): Promise<PdfProductionSuiteReport> {
  const cases = buildPdfProductionCases();
  const gen = new PdfDeliverableGenerator();
  const failures: PdfProductionSuiteReport["failures"] = [];
  const times: number[] = [];
  let success = 0;
  let corrupt = 0;

  const suiteId = `pdfprod_${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 23)}_${Math.random().toString(16).slice(2, 10)}`;
  const outDir = join(artifactRoot(), suiteId);
  mkdirSync(outDir, { recursive: true });

  for (const c of cases) {
    const started = Date.now();
    try {
      const file = await gen.generate(c.content, c.fileName);
      const ms = Date.now() - started;
      times.push(ms);
      const inspect = await inspectPdfProduction(file.buffer);
      const quality = await verifyPdfQuality(file);
      if (!inspect.ok || inspect.zeroByte || !quality.ok) {
        corrupt += inspect.zeroByte || !inspect.headerOk ? 1 : 0;
        failures.push({
          id: c.id,
          reasons: [...inspect.reasons, ...quality.reasons],
          ms,
        });
        continue;
      }
      if (c.expectMultiPage && inspect.pageCount < 2) {
        failures.push({ id: c.id, reasons: ["expected_multipage"], ms });
        continue;
      }
      if (c.expectImages && inspect.imageXObjectCount < 1) {
        failures.push({ id: c.id, reasons: ["image_missing"], ms });
        continue;
      }
      success += 1;
      if (success <= 5) {
        writeFileSync(join(outDir, `${c.id}.pdf`), file.buffer);
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
  const v1sha = (await inspectPdfProduction(v1.buffer)).sha256;
  const group = createVersionGroup({
    deliverableId: "pdf_rev_1",
    createdBy: "pdf-production-suite",
    displayName: "revision_v1.pdf",
    internalFileName: "revision_v1.pdf",
    jobId: null,
  });
  const v2content = `${v1content}\n\n## 追記\n\n改ページ確認のための追記段落です。\n\n${"| A | B |\n| --- | --- |\n| 1 | 2 |"}`;
  const v2 = await gen.generate(v2content, "revision_v2");
  addDeliverableVersion({
    groupId: group.groupId,
    newDeliverableId: "pdf_rev_2",
    parentDeliverableId: "pdf_rev_1",
    createdBy: "pdf-production-suite",
    displayName: "revision_v2.pdf",
    internalFileName: "revision_v2.pdf",
    revisionReason: "文章追加・表追加",
    jobId: null,
    diffSummary: "pages+table",
  });
  const v1shaAfter = (await inspectPdfProduction(v1.buffer)).sha256;
  const v2Report = await inspectPdfProduction(v2.buffer);
  const revisionOk =
    v1sha === v1shaAfter &&
    v2Report.ok &&
    v1sha !== v2Report.sha256 &&
    group.groupId.length > 0;

  const wordParity = await verifyWordPdfParity(cases.find((c) => c.category === "契約書")!.content);
  const excelParity = await verifyExcelPdfParity({
    content: cases.find((c) => c.expectTables)!.content,
  });

  const sorted = [...times].sort((a, b) => a - b);
  const avgMs =
    times.length === 0
      ? 0
      : Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100;
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
    failures.length === 0;

  const reportPath = join(outDir, "PDF_PRODUCTION_FINAL.md");
  const report: PdfProductionSuiteReport = {
    suiteId,
    generatedAt: new Date().toISOString(),
    featureEvaluation: PDF_PRODUCTION_FEATURE_EVALUATION,
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
    phasePass,
    failures,
    reportPath,
  };

  const md = [
    "# PDF Production Ready — FINAL",
    "",
    `suiteId: ${suiteId}`,
    `phasePass: ${phasePass}`,
    "",
    `n=${n} successRate=${successRate} corruptRate=${corruptRate}`,
    `avgMs=${avgMs} p95Ms=${p95Ms}`,
    `revisionOk=${revisionOk} wordParityOk=${wordParity.ok} excelParityOk=${excelParity.ok}`,
    "",
    "## Failures",
    failures.length === 0
      ? "- none"
      : failures.map((f) => `- ${f.id}: ${f.reasons.join(", ")}`).join("\n"),
    "",
    "## Word parity",
    JSON.stringify(wordParity),
    "",
    "## Excel parity",
    JSON.stringify(excelParity),
  ].join("\n");

  writeFileSync(reportPath, md, "utf8");
  writeFileSync(join(artifactRoot(), "latest.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(artifactRoot(), "PDF_PRODUCTION_FINAL.md"), md, "utf8");

  return report;
}
