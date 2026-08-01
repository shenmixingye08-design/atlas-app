import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetDeliverableVersionsForTests } from "@/lib/deliverables/versioning";
import { resetArtifactIdempotencyForTests } from "@/lib/artifact-platform";
import { aggregateArtifactDurability } from "@/lib/artifact-durability/aggregate";
import {
  ARTIFACT_DURABILITY_CASES,
  assertArtifactCaseCounts,
} from "@/lib/artifact-durability/cases";
import { captureArtifactDurabilityScreenshots } from "@/lib/artifact-durability/capture-screenshots";
import { runConversionSuite } from "@/lib/artifact-durability/conversions";
import { inspectArtifactDurabilityEnv } from "@/lib/artifact-durability/env-check";
import { runArtifactCase } from "@/lib/artifact-durability/run-case";
import type {
  ArtifactCaseResult,
  ArtifactDurabilityAggregate,
  ArtifactFormatUnderTest,
  ConversionCaseResult,
} from "@/lib/artifact-durability/types";
import type { ArtifactDurabilityEnv } from "@/lib/artifact-durability/env-check";

export const DEFAULT_ARTIFACT_DURABILITY_OUT =
  process.env.ARTIFACT_DURABILITY_OUT?.trim() ||
  "/opt/cursor/artifacts/artifact-durability";

function fmt(rate: number | null | undefined): string {
  if (rate == null) return "未計測";
  return `${(rate * 100).toFixed(2)}%`;
}

export async function runArtifactDurabilitySuite(options?: {
  outDir?: string;
  /** Limit per format for smoke (default all 100). */
  perFormatLimit?: number;
  conversionPerPair?: number;
  revisionPerFormat?: number;
}): Promise<{
  suiteId: string;
  outDir: string;
  reportPath: string;
  results: ArtifactCaseResult[];
  aggregate: ReturnType<typeof aggregateArtifactDurability>;
  env: ReturnType<typeof inspectArtifactDurabilityEnv>;
}> {
  const env = inspectArtifactDurabilityEnv();
  const suiteId = `adur_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
  const outDir = join(options?.outDir ?? DEFAULT_ARTIFACT_DURABILITY_OUT, suiteId);
  mkdirSync(outDir, { recursive: true });

  assertArtifactCaseCounts();

  resetDurableDeliverableStoreForTests();
  resetDeliverableVersionsForTests();
  resetArtifactIdempotencyForTests();

  writeFileSync(
    join(outDir, "env-report.json"),
    JSON.stringify(env, null, 2),
    "utf8"
  );
  writeFileSync(join(outDir, "setup-steps.txt"), env.setupSteps.join("\n"), "utf8");

  const perFormatLimit = options?.perFormatLimit ?? 100;
  const revisionPerFormat = options?.revisionPerFormat ?? 20;
  const userId = "artifact_durability_user";
  const otherUserId = "artifact_durability_other_user";

  const cases = (["docx", "xlsx", "pdf", "pptx"] as ArtifactFormatUnderTest[]).flatMap(
    (format) =>
      ARTIFACT_DURABILITY_CASES.filter((c) => c.format === format).slice(
        0,
        perFormatLimit
      )
  );

  writeFileSync(
    join(outDir, "cases.json"),
    JSON.stringify(
      cases.map((c) => ({
        caseId: c.caseId,
        format: c.format,
        category: c.category,
        title: c.title,
        // content omitted from index to keep small; full content in binaries path via generation
        assignment: c.assignment,
      })),
      null,
      2
    ),
    "utf8"
  );

  const revisionCounts: Record<string, number> = {
    docx: 0,
    xlsx: 0,
    pdf: 0,
    pptx: 0,
  };

  const results: ArtifactCaseResult[] = [];
  for (const c of cases) {
    const runRevision = (revisionCounts[c.format] ?? 0) < revisionPerFormat;
    const result = await runArtifactCase(c, {
      userId,
      otherUserId,
      outDir,
      runRevision,
      environment: "local",
    });
    if (runRevision) revisionCounts[c.format] = (revisionCounts[c.format] ?? 0) + 1;
    results.push(result);
  }

  // Production requirement: cannot fake. Record explicit zero if env missing.
  if (!env.canRunProductionHttp) {
    writeFileSync(
      join(outDir, "PRODUCTION_BLOCKED.md"),
      [
        "# Production runs blocked",
        "",
        "Phase2 requires ≥20 production cases per format.",
        "This environment cannot call authenticated production artifact APIs.",
        "",
        ...env.blockers.map((b) => `- ${b}`),
        "",
        ...env.setupSteps,
        "",
      ].join("\n"),
      "utf8"
    );
  }

  const conversions = await runConversionSuite({
    userId: `${userId}_conv`,
    countPerPair: options?.conversionPerPair ?? 20,
  });
  writeFileSync(
    join(outDir, "conversions.json"),
    JSON.stringify(conversions, null, 2),
    "utf8"
  );

  const aggregate = aggregateArtifactDurability({
    results,
    conversions,
    productionRequiredPerFormat: 20,
  });

  // Force production gate failure into reasons if blocked
  if (!env.canRunProductionHttp) {
    aggregate.phase2Pass = false;
    aggregate.phase2FailReasons.push(
      "本番実行 各形式20件未満（PRODUCTION_E2E_BASE_URL/Clerk/Supabase/CRON_SECRET 不足）"
    );
    aggregate.targetAssessment.productionPerFormat = {
      pass: false,
      actual: 0,
      note: "production blocked",
    };
  }

  const screenshots = await captureArtifactDurabilityScreenshots({
    outDir,
    results,
    conversions,
    productionBaseUrl: env.productionUrlGuess,
  });
  writeFileSync(
    join(outDir, "screenshots-meta.json"),
    JSON.stringify(screenshots, null, 2),
    "utf8"
  );

  const reportPath = join(outDir, "PHASE2_REPORT.md");
  const lines = [
    "# Artifact Durability Phase 2 Report",
    "",
    `suiteId: ${suiteId}`,
    `generatedAt: ${new Date().toISOString()}`,
    "",
    "## 1. 評価環境",
    "",
    `- local generation: YES (OpenAI不要)`,
    `- production HTTP: ${env.canRunProductionHttp ? "YES" : "NO"}`,
    `- PRODUCTION_E2E_BASE_URL: ${env.productionE2eBaseUrl ?? "unset"}`,
    `- blockers: ${env.blockers.join(" | ") || "none"}`,
    "",
    "## 2–3. 件数",
    "",
    `- total: ${aggregate.totalCases}`,
    `- docx: ${aggregate.byFormat.docx.total}`,
    `- xlsx: ${aggregate.byFormat.xlsx.total}`,
    `- pdf: ${aggregate.byFormat.pdf.total}`,
    `- pptx: ${aggregate.byFormat.pptx.total}`,
    `- conversions: ${aggregate.conversion.total}`,
    "",
    "## 4–12. 形式別指標",
    "",
    "| Format | 生成成功率 | 構造検証 | Storage | Preview | DL | Revision | **最終成功率** | 破損率 | p95ms | n | prod n |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map((f) => {
      const a = aggregate.byFormat[f];
      return `| ${f} | ${fmt(a.generateRate)} | ${fmt(a.structureRate)} | ${fmt(a.storageRate)} | ${fmt(a.previewRate)} | ${fmt(a.downloadRate)} | ${fmt(a.revisionRate)} | **${fmt(a.finalRate)}** | ${fmt(a.corruptRate)} | ${a.p95Ms?.toFixed(0) ?? "—"} | ${a.total} | ${a.productionCount} |`;
    }),
    "",
    "### 変換",
    "",
    `- overall: ${fmt(aggregate.conversion.rate)} (${aggregate.conversion.success}/${aggregate.conversion.total})`,
    ...Object.entries(aggregate.conversion.byPair).map(
      ([k, v]) => `- ${k}: ${fmt(v.rate)} (${v.success}/${v.total})`
    ),
    "",
    "### 失敗原因ランキング",
    "",
    ...aggregate.failureRanking.map((f) => `- ${f.class}: ${f.count}`),
    "",
    "## Latency",
    "",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map((f) => {
      const a = aggregate.byFormat[f];
      return `- ${f}: avg=${a.avgMs?.toFixed(0) ?? "—"} median=${a.medianMs?.toFixed(0) ?? "—"} p90=${a.p90Ms?.toFixed(0) ?? "—"} p95=${a.p95Ms?.toFixed(0) ?? "—"} p99=${a.p99Ms?.toFixed(0) ?? "—"} avgBytes=${a.avgFileBytes?.toFixed(0) ?? "—"}`;
    }),
    "",
    "## Phase 2 判定",
    "",
    `**${aggregate.phase2Pass ? "PASS" : "FAIL"}**`,
    "",
    ...aggregate.phase2FailReasons.map((r) => `- ${r}`),
    "",
    "## スクリーンショット",
    "",
    ...screenshots.map(
      (s) => `- ${s.label}: ${s.path ?? "null"} (${s.note})`
    ),
    "",
    "## request_id 一覧（先頭40）",
    "",
    ...results
      .slice(0, 40)
      .map(
        (r) =>
          `- ${r.caseId}: \`${r.requestId}\` final=${r.okFinal} artifact=${r.artifactId ?? "null"}`
      ),
    "",
    "## 未達 / Critical",
    "",
    ...aggregate.phase2FailReasons.map((r) => `- ${r}`),
    `- crossUserAccessCount: ${aggregate.crossUserAccessCount}`,
    `- revisionSourceLostCount: ${aggregate.revisionSourceLostCount}`,
    `- duplicateRate: ${aggregate.duplicateRate ?? "null"}`,
    "",
    "## ロールバック",
    "",
    "- 本Phaseは計測ハーネス中心。本番デプロイ未実施ならアプリ変更のロールバック不要。",
    "- 生成器/integrity修正を入れた場合は該当コミットを revert。",
    "",
  ];
  writeFileSync(reportPath, lines.join("\n"), "utf8");
  writeFileSync(
    join(outDir, "PHASE2_FINAL.md"),
    buildFinalReport({
      suiteId,
      env,
      aggregate,
      results,
      conversions,
      screenshots,
    }),
    "utf8"
  );
  writeFileSync(
    join(outDir, "BEFORE_AFTER.md"),
    [
      "# Before / After",
      "",
      "## Before",
      "- Word/Excel/PDF/PPTX: 100% (n=1) — 品質証明として不十分",
      "",
      "## After",
      ...(["docx", "xlsx", "pdf", "pptx"] as const).map((f) => {
        const a = aggregate.byFormat[f];
        return `- ${f}: 最終成功率 ${fmt(a.finalRate)} (n=${a.total}, prod=${a.productionCount})`;
      }),
      `- conversion: ${fmt(aggregate.conversion.rate)} (n=${aggregate.conversion.total})`,
      `- phase2: ${aggregate.phase2Pass ? "PASS" : "FAIL"}`,
      "",
    ].join("\n"),
    "utf8"
  );
  writeFileSync(
    join(outDir, "aggregate.json"),
    JSON.stringify(aggregate, null, 2),
    "utf8"
  );
  writeFileSync(
    join(outDir, "results.json"),
    JSON.stringify(results, null, 2),
    "utf8"
  );
  writeFileSync(
    join(options?.outDir ?? DEFAULT_ARTIFACT_DURABILITY_OUT, "latest.json"),
    JSON.stringify(
      {
        suiteId,
        reportPath,
        phase2Pass: aggregate.phase2Pass,
        totals: Object.fromEntries(
          (["docx", "xlsx", "pdf", "pptx"] as const).map((f) => [
            f,
            {
              n: aggregate.byFormat[f].total,
              finalRate: aggregate.byFormat[f].finalRate,
              p95Ms: aggregate.byFormat[f].p95Ms,
            },
          ])
        ),
      },
      null,
      2
    ),
    "utf8"
  );

  return { suiteId, outDir, reportPath, results, aggregate, env };
}

function buildFinalReport(input: {
  suiteId: string;
  env: ArtifactDurabilityEnv;
  aggregate: ArtifactDurabilityAggregate;
  results: ArtifactCaseResult[];
  conversions: ConversionCaseResult[];
  screenshots: Array<{ label: string; path: string | null; note: string }>;
}): string {
  const { aggregate: a, env, results, conversions, screenshots, suiteId } =
    input;
  const lines = [
    "# MINERVOT Artifact Durability Phase 2 — FINAL",
    "",
    `suiteId: ${suiteId}`,
    `generatedAt: ${new Date().toISOString()}`,
    "",
    "## 1. 評価環境",
    `- local: YES（OpenAI不要の実ファイル生成）`,
    `- production HTTP: ${env.canRunProductionHttp ? "YES" : "NO"}`,
    `- PRODUCTION_E2E_BASE_URL: ${env.productionE2eBaseUrl ?? "unset"}`,
    `- blockers: ${env.blockers.join(" | ") || "none"}`,
    "",
    "## 2. 総実行件数",
    `- generation cases: ${a.totalCases}`,
    `- conversion cases: ${a.conversion.total}`,
    `- grand total: ${a.totalCases + a.conversion.total}`,
    "",
    "## 3. 形式別実行件数",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map(
      (f) => `- ${f}: ${a.byFormat[f].total} (prod=${a.byFormat[f].productionCount})`
    ),
    "",
    "## 4. 形式別最終成功率（生成≠最終）",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map((f) => {
      const row = a.byFormat[f];
      return `- ${f}: generate=${fmt(row.generateRate)} / **final=${fmt(row.finalRate)}** (n=${row.total})`;
    }),
    "",
    "## 5. 構造検証成功率",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map(
      (f) => `- ${f}: ${fmt(a.byFormat[f].structureRate)}`
    ),
    "",
    "## 6. 破損率",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map(
      (f) => `- ${f}: ${fmt(a.byFormat[f].corruptRate)}`
    ),
    "",
    "## 7. Storage成功率",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map(
      (f) => `- ${f}: ${fmt(a.byFormat[f].storageRate)}`
    ),
    "",
    "## 8. プレビュー成功率",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map(
      (f) => `- ${f}: ${fmt(a.byFormat[f].previewRate)}`
    ),
    "",
    "## 9. ダウンロード成功率",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map(
      (f) => `- ${f}: ${fmt(a.byFormat[f].downloadRate)}`
    ),
    "",
    "## 10. 再編集成功率",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map(
      (f) => `- ${f}: ${fmt(a.byFormat[f].revisionRate)}`
    ),
    "",
    "## 11. revision成功率",
    "（再編集と同義で計測。元成果物消失件数: " +
      `${a.revisionSourceLostCount}）`,
    "",
    "## 12. 変換成功率",
    `- overall: ${fmt(a.conversion.rate)} (${a.conversion.success}/${a.conversion.total})`,
    ...Object.entries(a.conversion.byPair).map(
      ([k, v]) => `- ${k}: ${fmt(v.rate)} (${v.success}/${v.total})`
    ),
    "",
    "## 13. 平均・p90・p95・p99",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map((f) => {
      const row = a.byFormat[f];
      return `- ${f}: avg=${row.avgMs?.toFixed(0) ?? "—"} p90=${row.p90Ms?.toFixed(0) ?? "—"} p95=${row.p95Ms?.toFixed(0) ?? "—"} p99=${row.p99Ms?.toFixed(0) ?? "—"} avgBytes=${row.avgFileBytes?.toFixed(0) ?? "—"}`;
    }),
    "",
    "## 14. 失敗原因ランキング",
    ...(a.failureRanking.length
      ? a.failureRanking.map((f) => `- ${f.class}: ${f.count}`)
      : ["- (none)"]),
    "",
    "## 15. 変更ファイル一覧",
    "- lib/artifact-durability/*（評価ハーネス）",
    "- package.json scripts",
    "- lib/quality-assurance/aggregator.ts（Phase2レート優先）",
    "",
    "## 16. 修正内容",
    "- n=1の自己申告100%を廃し、400件+変換の実測ハーネスを追加",
    "- 最終成功=生成+構造+保存+DB+preview+DL（生成のみは成功にしない）",
    "- 本番不足は明示FAIL",
    "",
    "## 17. スクリーンショット一覧",
    ...screenshots.map((s) => `- ${s.label}: ${s.path ?? "null"} — ${s.note}`),
    "",
    "## 18. request_id一覧（先頭80）",
    ...results.slice(0, 80).map((r) => `- ${r.caseId}: ${r.requestId}`),
    ...conversions
      .slice(0, 40)
      .map((c) => `- ${c.caseId}: ${c.requestId}`),
    "",
    "## 19. 改善前後比較",
    "- Before: Word/Excel/PDF/PPTX 100% (n=1)",
    ...(["docx", "xlsx", "pdf", "pptx"] as const).map((f) => {
      const row = a.byFormat[f];
      return `- After ${f}: final=${fmt(row.finalRate)} (n=${row.total}, prod=${row.productionCount})`;
    }),
    "",
    "## 20. 未達項目",
    ...a.phase2FailReasons.map((r) => `- ${r}`),
    "",
    "## 21. 残るCritical",
    "- production_e2e_unverified（本番各形式20件未実施）",
    "- 既存: authz_global_knowledge_company / billing_gap_heavy_routes（本Phase対象外）",
    "",
    "## 22. 本番デプロイ結果",
    "- 未デプロイ（本エージェント実行は計測・ハーネス追加）。本番E2Eは secrets 不足で未実行。",
    "",
    "## 23. ロールバック方法",
    "- `git revert` で artifact-durability / aggregator 変更を戻す",
    "- 評価証拠は `/opt/cursor/artifacts/artifact-durability/`（リポジトリ外）",
    "",
    "## 24. Phase 2合格判定",
    "",
    `**${a.phase2Pass ? "PASS" : "FAIL"}**`,
    "",
  ];
  return lines.join("\n");
}
