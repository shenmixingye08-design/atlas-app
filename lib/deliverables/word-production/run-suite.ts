import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { estimatePageCount } from "@/lib/deliverables/generators/docx-renderer";
import { resolveDocumentModel } from "@/lib/deliverables/document-model/normalize-document-model";
import {
  addDeliverableVersion,
  createVersionGroup,
  listDeliverableVersions,
  resetDeliverableVersionsForTests,
} from "@/lib/deliverables/versioning";
import { inspectDocxProduction } from "@/lib/deliverables/word-production/docx-quality";
import { checkWordPdfParity } from "@/lib/deliverables/word-production/word-pdf-parity";
import {
  LONG_PAGE_TARGETS,
  buildLongPageCase,
  buildWordProductionCases,
} from "@/lib/deliverables/word-production/cases";
import { WORD_PRODUCTION_FEATURE_EVALUATION } from "@/lib/deliverables/word-production/feature-evaluation";

export const DEFAULT_WORD_PRODUCTION_OUT =
  process.env.WORD_PRODUCTION_OUT?.trim() ||
  "/opt/cursor/artifacts/word-production";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? null;
}

export async function runWordProductionSuite(options?: {
  outDir?: string;
  caseCount?: number;
  includeLongPages?: boolean;
}) {
  const outRoot = options?.outDir ?? DEFAULT_WORD_PRODUCTION_OUT;
  const suiteId = `wordprod_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
  const outDir = join(outRoot, suiteId);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "samples"), { recursive: true });

  resetDeliverableVersionsForTests();
  const generator = new DocxDeliverableGenerator();
  const cases = buildWordProductionCases(options?.caseCount ?? 100);
  const durations: number[] = [];
  let success = 0;
  let corrupt = 0;
  const failures: Array<{ caseId: string; reasons: string[] }> = [];
  const rows: Array<Record<string, unknown>> = [];

  for (const c of cases) {
    const started = Date.now();
    try {
      const content = c.buildContent();
      const file = await generator.generate(content, c.title, {
        title: c.title,
        templateId: c.templateId,
      });
      const report = inspectDocxProduction(file.buffer);
      const ms = Date.now() - started;
      durations.push(ms);
      if (!report.ok || report.zeroByte) {
        corrupt += 1;
        failures.push({ caseId: c.caseId, reasons: report.reasons });
      } else {
        success += 1;
      }
      if (rows.length < 12) {
        writeFileSync(join(outDir, "samples", `${c.caseId}.docx`), file.buffer);
      }
      rows.push({
        caseId: c.caseId,
        category: c.category,
        templateId: c.templateId,
        ok: report.ok,
        ms,
        sizeBytes: report.sizeBytes,
        pages: report.estimatedPages,
        tables: report.tableCount,
        headings: report.headingCount,
        reasons: report.reasons,
      });
    } catch (error) {
      const ms = Date.now() - started;
      durations.push(ms);
      corrupt += 1;
      const message = error instanceof Error ? error.message : "unknown";
      failures.push({ caseId: c.caseId, reasons: [message] });
      rows.push({
        caseId: c.caseId,
        category: c.category,
        ok: false,
        ms,
        reasons: [message],
      });
    }
  }

  // Long page durability
  const longResults: Array<Record<string, unknown>> = [];
  if (options?.includeLongPages !== false) {
    for (const pages of LONG_PAGE_TARGETS) {
      const c = buildLongPageCase(pages);
      const started = Date.now();
      try {
        const content = c.buildContent();
        const before = process.memoryUsage().heapUsed;
        const file = await generator.generate(content, c.title, {
          title: c.title,
          templateId: c.templateId,
        });
        const after = process.memoryUsage().heapUsed;
        const report = inspectDocxProduction(file.buffer);
        const model = resolveDocumentModel({
          content,
          title: c.title,
          templateId: c.templateId,
        }).model;
        longResults.push({
          pages,
          ok: report.ok,
          ms: Date.now() - started,
          sizeBytes: report.sizeBytes,
          estimatedPages: report.estimatedPages,
          modelEstimate: estimatePageCount(model),
          heapDeltaMb: Number(((after - before) / (1024 * 1024)).toFixed(2)),
          reasons: report.reasons,
        });
        writeFileSync(join(outDir, "samples", `${c.caseId}.docx`), file.buffer);
      } catch (error) {
        longResults.push({
          pages,
          ok: false,
          ms: Date.now() - started,
          reasons: [error instanceof Error ? error.message : "unknown"],
        });
      }
    }
  }

  // Revision: original immutable + new version
  const revisionContent = buildWordProductionCases(1)[0]!.buildContent();
  const original = await generator.generate(revisionContent, "revision-base", {
    title: "revision-base",
  });
  const originalSha = inspectDocxProduction(original.buffer).sha256;
  const v1 = createVersionGroup({
    deliverableId: "word_rev_v1",
    createdBy: "word_prod_user",
    displayName: "revision-base.docx",
    internalFileName: "revision-base.docx",
  });
  const revised = await generator.generate(
    `${revisionContent}\n\n## 追記セクション\n\n再編集で追加した段落です。\n\n| 追加 | 値 |\n| --- | --- |\n| A | 1 |\n`,
    "revision-v2",
    { title: "revision-v2" },
  );
  addDeliverableVersion({
    groupId: v1.groupId,
    newDeliverableId: "word_rev_v2",
    parentDeliverableId: "word_rev_v1",
    createdBy: "word_prod_user",
    displayName: "revision-v2.docx",
    internalFileName: "revision-v2.docx",
    revisionReason: "content_append",
    diffSummary: "added section/table",
  });
  const originalAfter = inspectDocxProduction(original.buffer).sha256;
  const versions = listDeliverableVersions(v1.groupId);
  const revisionOk =
    originalSha === originalAfter &&
    versions.length === 2 &&
    inspectDocxProduction(revised.buffer).ok;

  // Word→PDF parity (sample)
  const parity = await checkWordPdfParity({
    content: buildWordProductionCases(1)[0]!.buildContent(),
    title: "parity-sample",
  });

  const sorted = [...durations].sort((a, b) => a - b);
  const n = cases.length;
  const successRate = n === 0 ? 0 : success / n;
  const corruptRate = n === 0 ? 0 : corrupt / n;
  const avgMs =
    durations.length === 0
      ? null
      : durations.reduce((a, b) => a + b, 0) / durations.length;
  const p95Ms = percentile(sorted, 95);

  const phasePass =
    successRate >= 0.95 &&
    corruptRate === 0 &&
    revisionOk &&
    parity.ok &&
    longResults.every((r) => r.ok === true);

  const latest = {
    suiteId,
    generatedAt: new Date().toISOString(),
    featureEvaluation: WORD_PRODUCTION_FEATURE_EVALUATION,
    n,
    success,
    corrupt,
    successRate,
    corruptRate,
    avgMs,
    p95Ms,
    revisionOk,
    parityOk: parity.ok,
    longPageOk: longResults.every((r) => r.ok === true),
    phasePass,
  };

  writeFileSync(join(outDir, "latest.json"), JSON.stringify(latest, null, 2));
  writeFileSync(join(outRoot, "latest.json"), JSON.stringify(latest, null, 2));
  writeFileSync(join(outDir, "cases.json"), JSON.stringify(rows, null, 2));
  writeFileSync(join(outDir, "long-pages.json"), JSON.stringify(longResults, null, 2));
  writeFileSync(join(outDir, "parity.json"), JSON.stringify(parity, null, 2));
  writeFileSync(
    join(outDir, "failures.json"),
    JSON.stringify(failures, null, 2),
  );

  const report = [
    "# Word Production Ready — FINAL",
    "",
    `suiteId: ${suiteId}`,
    `phasePass: ${phasePass}`,
    "",
    `n=${n} successRate=${successRate} corruptRate=${corruptRate}`,
    `avgMs=${avgMs} p95Ms=${p95Ms}`,
    `revisionOk=${revisionOk} parityOk=${parity.ok}`,
    "",
    "## Long pages",
    ...longResults.map((r) => `- ${JSON.stringify(r)}`),
    "",
    "## Failures",
    failures.length === 0
      ? "- none"
      : failures.map((f) => `- ${f.caseId}: ${f.reasons.join(",")}`).join("\n"),
    "",
  ].join("\n");
  writeFileSync(join(outDir, "WORD_PRODUCTION_FINAL.md"), report);
  writeFileSync(join(outRoot, "WORD_PRODUCTION_FINAL.md"), report);

  return {
    suiteId,
    outDir,
    latest,
    phasePass,
    reportPath: join(outDir, "WORD_PRODUCTION_FINAL.md"),
  };
}
