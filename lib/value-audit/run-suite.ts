import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

import { COMPETITIVE_MATRIX, MINERVOT_LOSSES, MINERVOT_WINS } from "./competitive";
import {
  DEFAULT_VALUE_DEMO_OUT,
  runLocalValueDemos,
  writeDemoEvidence,
} from "./demo-flows";
import {
  FEATURE_INVENTORY,
  inventoryByStatus,
  productionReadyCount,
} from "./feature-inventory";
import { pricingSummary } from "./pricing-economics";
import {
  CHATGPT_TEST_ANSWERS,
  CORE_USE_CASES,
  DIFFERENTIATION_CORES,
  JOB_DEFINITION,
  USE_CASES,
} from "./use-cases";
import { summarizeFunnel } from "@/lib/product-funnel/events";

export async function runValueAuditSuite(options?: { outDir?: string }) {
  const outRoot = options?.outDir ?? DEFAULT_VALUE_DEMO_OUT;
  const suiteId = `va_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
  const outDir = join(outRoot, suiteId);
  mkdirSync(outDir, { recursive: true });

  const demos = await runLocalValueDemos();
  writeDemoEvidence(outDir, demos);

  const pricing = pricingSummary();
  const localDemosOk = demos.flows.every((f) => f.ok);
  const productionDemosOk = demos.productionOk;
  const productionReadyFeatures = productionReadyCount();

  const phase5Pass =
    productionReadyFeatures >= 0 && // inventory exists
    CORE_USE_CASES.length > 0 &&
    CORE_USE_CASES.length <= 10 &&
    DIFFERENTIATION_CORES.length <= 3 &&
    localDemosOk &&
    productionDemosOk && // required by acceptance — fails without prod
    Boolean(process.env.PRODUCTION_E2E_BASE_URL?.trim());

  const publishValueYes =
    pricing.publishValueOpinion === "conditional_yes" && productionDemosOk;

  const report = buildReport({
    suiteId,
    demos,
    pricing,
    phase5Pass,
    publishValueYes,
    localDemosOk,
    productionDemosOk,
  });

  const reportPath = join(outDir, "PHASE5_FINAL.md");
  writeFileSync(reportPath, report, "utf8");
  writeFileSync(
    join(outRoot, "latest.json"),
    JSON.stringify(
      {
        suiteId,
        reportPath,
        phase5Pass,
        publishValueYes,
        localDemosOk,
        productionDemosOk,
        coreUseCases: CORE_USE_CASES.length,
      },
      null,
      2
    )
  );
  writeFileSync(
    join(outDir, "inventory.json"),
    JSON.stringify(FEATURE_INVENTORY, null, 2)
  );
  writeFileSync(
    join(outDir, "use-cases.json"),
    JSON.stringify({ all: USE_CASES, core: CORE_USE_CASES }, null, 2)
  );

  // Also mirror final to root for convenience
  writeFileSync(join(outRoot, "PHASE5_FINAL.md"), report, "utf8");

  return {
    suiteId,
    outDir,
    reportPath,
    phase5Pass,
    publishValueYes,
    demos,
    pricing,
    funnel: summarizeFunnel(),
  };
}

function buildReport(input: {
  suiteId: string;
  demos: Awaited<ReturnType<typeof runLocalValueDemos>>;
  pricing: ReturnType<typeof pricingSummary>;
  phase5Pass: boolean;
  publishValueYes: boolean;
  localDemosOk: boolean;
  productionDemosOk: boolean;
}): string {
  const unverified = inventoryByStatus("実装済みだが本番未検証");
  const limited = inventoryByStatus("一部制限あり");
  const unimplemented = [
    ...inventoryByStatus("未実装"),
    ...inventoryByStatus("仮実装"),
    ...inventoryByStatus("UIのみ"),
  ];
  const lines: string[] = [
    "# MINERVOT Value / Differentiation Audit — Phase 5 FINAL",
    "",
    `suiteId: ${input.suiteId}`,
    `generatedAt: ${new Date().toISOString()}`,
    "",
    "## 26. Phase 5合格判定",
    "",
    `**${input.phase5Pass ? "PASS" : "FAIL"}**`,
    "",
    "- 受け入れは本番E2Eデモ成功を要求。本エージェントでは PRODUCTION_E2E 未設定のため FAIL",
    `- localDemosOk=${input.localDemosOk} productionDemosOk=${input.productionDemosOk}`,
    "",
    "## 27–28. 月額980円で公開する価値",
    "",
    `**${input.publishValueYes ? "YES" : "NO"}**`,
    "",
    input.pricing.publishValueReason,
    "",
    "## 1. 本番で利用可能な機能",
    "",
    productionReadyCount() === 0
      ? "- （なし — 本番E2E未検証のため「本番で正常利用可能」は0件）"
      : inventoryByStatus("本番で正常利用可能")
          .map((r) => `- ${r.name}`)
          .join("\n"),
    "",
    "## 2. 制限付き / 本番未検証",
    "",
    "### 一部制限あり",
    ...limited.map((r) => `- ${r.name}: ${r.notes || r.evidence}`),
    "",
    "### 実装済みだが本番未検証",
    ...unverified.map((r) => `- ${r.name}: ${r.evidence}`),
    "",
    "## 3. 未実装・仮実装・UIのみ",
    "",
    ...(unimplemented.length
      ? unimplemented.map((r) => `- [${r.status}] ${r.name}`)
      : [
          "- 専用家計簿モジュール: 未実装",
          "- Email通知チャネル: 未実装",
          "- Notion/YouTube接続: 仮実装(stub)",
          "- CSV専用ジェネレータ: 未実装（変換のみ）",
        ]),
    "",
    "## 4. 主要ユーザー",
    "",
    ...JOB_DEFINITION.primaryUsers.map((u) => `- ${u}`),
    "",
    "まだ主力にしない:",
    ...JOB_DEFINITION.notPrimaryYet.map((u) => `- ${u}`),
    "",
    "## 5. 主要ユースケース（core）",
    "",
    ...CORE_USE_CASES.map(
      (u) =>
        `- **${u.title}** / 対象:${u.audience} / 短縮目安:${u.saveMinutesEstimate}分 / 980円理由:${u.worth980 ? "YES" : "NO"} / 完成度:${u.techMaturity} / 本番:${u.productionSuccess}`
    ),
    "",
    "除外:",
    ...USE_CASES.filter((u) => !u.keptAsCore).map(
      (u) => `- ${u.title} — ${u.reasonIfDropped}`
    ),
    "",
    "## 6. 競合比較（要約）",
    "",
    "| 項目 | MINERVOT | ChatGPT | Copilot | 注記 |",
    "| --- | --- | --- | --- | --- |",
    ...COMPETITIVE_MATRIX.map(
      (r) =>
        `| ${r.dimension} | ${r.minervot} | ${r.chatgpt} | ${r.copilot} | ${r.note} |`
    ),
    "",
    "## 7. 勝っている点",
    ...MINERVOT_WINS.map((w) => `- ${w}`),
    "",
    "## 8. 負けている点",
    ...MINERVOT_LOSSES.map((w) => `- ${w}`),
    "",
    "## 9. ChatGPTでよくない？",
    "",
    ...CHATGPT_TEST_ANSWERS.map(
      (a) =>
        `- ${a.useCaseId}: 工程削減≈${a.stepsSaved} / 短縮≈${a.minutesSaved}分 / MINERVOT固有=${a.onlyMinervot} / 復帰理由=${a.returnReason}`
    ),
    "",
    "## 10. 差別化の核（最大3）",
    "",
    ...DIFFERENTIATION_CORES.map(
      (d) =>
        `- **${d.title}** — implemented=${d.implemented} productionProven=${d.productionProven} — ${d.caveat}`
    ),
    "",
    "## 11–14. 980円試算 / 原価 / 赤字条件 / 無料体験",
    "",
    `価格: ¥${input.pricing.priceJpy}`,
    ...input.pricing.personas.map(
      (p) =>
        `- ${p.personaId}: runs=${p.runs} 削減分=${p.minutesSaved} 時間価値=¥${p.timeValueJpy} 原価=¥${p.estimatedCogsJpy} 粗利=¥${p.grossMarginJpy} 価値倍率=${p.valueMultipleVsPrice}x`
    ),
    `- 赤字目安: ${input.pricing.breakEven.note}`,
    `- 無料体験: AI ${input.pricing.freeTrial.freeAiRuns}回 / Light上限 ${input.pricing.freeTrial.monthlyCapLight} / Vision目安 ${input.pricing.freeTrial.visionSoftCap} / ${input.pricing.freeTrial.overagePolicy}`,
    "",
    "## 15–17. 初回体験・改善・継続",
    "",
    "- 問題: 抽象コピー「なんでもできます」寄り、サンプルがChatGPT代替可能な文案中心、first-experienceの3秒タイムアウト偽成功リスク",
    "- 改善: ホームに具体ジョブ（Excel/PPT/Word/レシート→表）、計測イベント、履歴への継続導線、Light説明の文書作成明示",
    "- 継続: `/history` 再利用、revision、`/automations` 定期の仕事",
    "",
    "## 18–21. デモ",
    "",
    ...input.demos.flows.map(
      (f) =>
        `- ${f.id}: ok=${f.ok} env=${f.environment} ${f.durationMs}ms steps=${f.manualSteps} requestId=${f.requestId} jobId=${f.jobId} artifacts=${f.artifactIds.join(",")} note=${f.note}`
    ),
    "",
    "- 本番デモ: 未実行（秘密情報なし）。スクリーンショットはローカル生成のみ — 本番UI録画なし",
    "",
    "## 22–24. 変更 / 削除統合 / 計測",
    "",
    "- 変更: lib/value-audit/*, lib/product-funnel/*, home/landing/presets/i18n, plan highlights",
    "- 削除・統合: 未実装家計簿を「利用できます」表示から除外。画像生成クイックプリセットを非表示寄りに整理。Commander用語のユーザー露出を抑止",
    "- 計測: home_view, sample_select, request_start/submit, artifact_*, first_success, error_shown 等",
    "",
    "## 25. 残る課題",
    "",
    "- 本番E2E（依頼→DL）未実施",
    "- 外部連携・Push・Email未検証/未実装",
    "- LightではGoogle/自動投稿が使えず、980円の「秘書」訴求とプラン実態のギャップ",
    "- 成果物品質のブラインド評価未実施",
    "",
  ];
  return lines.join("\n");
}
