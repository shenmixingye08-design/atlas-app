import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

import { defaultBetaFindings } from "./findings";
import {
  computeBetaMetrics,
  evaluateGateTargets,
} from "./metrics";
import {
  BETA_FLOWS,
  INTERVIEW_QUESTIONS,
  NO_INSTRUCTION_BRIEF,
  TARGET_PERSONA_MIX,
} from "./protocol";
import {
  listBetaFeedback,
  listBetaSessions,
  resetBetaUxStoreForTests,
  setBetaFindings,
} from "./store";
import { summarizeFunnel } from "@/lib/product-funnel/events";

export const DEFAULT_BETA_UX_OUT =
  process.env.BETA_UX_OUT?.trim() ||
  "/opt/cursor/artifacts/beta-ux-phase6";

/**
 * Phase6 suite validates infrastructure + honesty gates.
 * Does NOT fabricate real-user success rates.
 */
export async function runBetaUxSuite(options?: { outDir?: string }) {
  const outRoot = options?.outDir ?? DEFAULT_BETA_UX_OUT;
  const suiteId = `beta_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
  const outDir = join(outRoot, suiteId);
  mkdirSync(outDir, { recursive: true });

  // Infrastructure self-check only — clear any accidental seed data for report baseline.
  // Real β sessions persist in process for admin UI; suite report uses current store.
  const sessions = listBetaSessions(5000);
  const feedback = listBetaFeedback(2000);
  const metrics = computeBetaMetrics(sessions, feedback);
  const findings = defaultBetaFindings({
    realTesterCount: metrics.testerCount,
    productionE2e: Boolean(
      process.env.PRODUCTION_E2E_BASE_URL?.trim() &&
        process.env.CLERK_SECRET_KEY?.trim()
    ),
  });
  setBetaFindings(findings);
  const gates = evaluateGateTargets(metrics);

  const requiredFlows = BETA_FLOWS.filter((f) => f.required).map((f) => f.id);
  const infraOk =
    requiredFlows.length >= 5 &&
    INTERVIEW_QUESTIONS.length >= 10 &&
    TARGET_PERSONA_MIX.length >= 6;

  const phase6Pass =
    infraOk &&
    gates.pass &&
    metrics.testerCount >= 10 &&
    findings.every((f) => f.severity !== "Critical" || f.status !== "open");

  const generalReleaseRecommended = false;

  const report = [
    "# MINERVOT Beta UX Phase 6 — FINAL",
    "",
    `suiteId: ${suiteId}`,
    `generatedAt: ${new Date().toISOString()}`,
    "",
    "## 29. Phase 6合格判定",
    "",
    `**${phase6Pass ? "PASS" : "FAIL"}**`,
    "",
    ...gates.failures.map((f) => `- ${f}`),
    "- 受け入れ条件: 実ユーザー10人以上・説明なし・主要5フロー・本番同等完遂。未達のため FAIL",
    "",
    "## 30–31. 一般公開推奨",
    "",
    `**${generalReleaseRecommended ? "YES" : "NO"}**`,
    "",
    "実ユーザー説明なしβが未実施のため公開推奨不可。計測基盤と初回導線改善は用意済み。",
    "",
    "## 1–4. テスター / 属性 / デバイス / フロー",
    "",
    `- βテスター人数（セッション計測）: **${metrics.testerCount}**`,
    `- 属性内訳: データなし（実β未実施）。目標ミックス: ${TARGET_PERSONA_MIX.map((p) => `${p.persona}≥${p.minCount}`).join(", ")}`,
    `- デバイス内訳: ${JSON.stringify(metrics.byDevice)}`,
    `- 実施フロー定義: ${BETA_FLOWS.map((f) => f.id).join(", ")}`,
    `- 説明なしブリーフ: ${NO_INSTRUCTION_BRIEF}`,
    "",
    "## 5–13. 成功率（分母付き）",
    "",
    `- 登録完了率: n=${metrics.signupCompleted.total} ※実サインアップ計測は本番Clerk連携後`,
    `- 初回依頼送信率: ${fmt(metrics.firstRequestSubmit)}`,
    `- 初回成果物完成率: ${fmt(metrics.firstArtifactComplete)}`,
    `- 初回ダウンロード率: ${fmt(metrics.firstDownload)}`,
    `- 初回完遂率: ${fmt(metrics.firstFlowComplete)}`,
    `- 7日以内再利用率: ${fmt(metrics.reuse7d)}`,
    `- 時間 avg/median/p90/p95: ${metrics.durationMs.avg}/${metrics.durationMs.median}/${metrics.durationMs.p90}/${metrics.durationMs.p95} (n=${metrics.durationMs.n})`,
    `- フロー別: ${JSON.stringify(metrics.byFlow)}`,
    `- デバイス別: ${JSON.stringify(metrics.byDevice)}`,
    "",
    "## 14–17. 離脱 / Findings",
    "",
    `- 離脱画面: ${JSON.stringify(metrics.dropoutScreens)}`,
    `- 離脱原因: ${JSON.stringify(metrics.dropoutReasons)}`,
    "",
    "### Critical",
    ...findings
      .filter((f) => f.severity === "Critical")
      .map((f) => `- [${f.status}] ${f.id}: ${f.title} — ${f.evidence}`),
    "",
    "### High",
    ...findings
      .filter((f) => f.severity === "High")
      .map((f) => `- [${f.status}] ${f.id}: ${f.title} — ${f.evidence}`),
    "",
    "## 18–22. 発言 / 支払意思 / ChatGPT",
    "",
    `- フィードバック件数: ${feedback.length}`,
    `- 支払意思: ${JSON.stringify(metrics.payIntent)}`,
    "- ユーザー発言要約: 実β未実施のため収集ゼロ（誘導質問で捏造しない）",
    "- 最も評価/不評: データ不足",
    "- ChatGPTではなく使う理由: データ不足",
    "",
    "## 23–24. 改善内容 / 変更",
    "",
    "- Phase6計測イベント拡張、βセッション/フィードバックAPI、Owner β UX画面",
    "- 成果物完了時のダウンロード/再編集ヒント、設定にβ感想フォーム",
    "- ホームはPhase5の実ファイル訴求を継続",
    "",
    "## 25. 改善前後比較",
    "",
    "- Before: 実ユーザー行動データなし / 偽成功リスクあり（Phase5で緩和）",
    "- After infra: 計測・管理・感想収集は可能。完遂率の改善証明は **再β後**",
    "",
    "## 26–27. 証拠 / request_id",
    "",
    "- スクリーンショット・実セッション録画: なし（実テスター未実施）",
    `- セッションrequest_id: ${sessions.map((s) => s.requestId).filter(Boolean).join(", ") || "なし"}`,
    "",
    "## 28. 残る課題",
    "",
    "- 実ユーザー10–20人の説明なしβ実施",
    "- PC/モバイル両デバイスでの完遂率確定評価",
    "- 改善後の未経験テスター再試験",
    "- 本番同等環境での成果物完成証明",
    "",
    `funnelSummary: ${JSON.stringify(summarizeFunnel())}`,
    "",
  ].join("\n");

  const reportPath = join(outDir, "PHASE6_FINAL.md");
  writeFileSync(reportPath, report, "utf8");
  writeFileSync(join(outRoot, "PHASE6_FINAL.md"), report, "utf8");
  writeFileSync(
    join(outRoot, "latest.json"),
    JSON.stringify(
      {
        suiteId,
        reportPath,
        phase6Pass,
        generalReleaseRecommended,
        testerCount: metrics.testerCount,
      },
      null,
      2
    )
  );
  writeFileSync(
    join(outDir, "metrics.json"),
    JSON.stringify({ metrics, findings, gates }, null, 2)
  );

  return {
    suiteId,
    outDir,
    reportPath,
    phase6Pass,
    generalReleaseRecommended,
    metrics,
    findings,
    gates,
  };
}

function fmt(r: {
  rate: number | null;
  total: number;
  definitive: boolean;
}): string {
  if (r.rate == null) return `— (n=${r.total})`;
  const p = `${(r.rate * 100).toFixed(1)}% (n=${r.total})`;
  return r.definitive ? p : `${p} ※非確定`;
}

export function resetBetaStoreForSuiteTests(): void {
  resetBetaUxStoreForTests();
}
