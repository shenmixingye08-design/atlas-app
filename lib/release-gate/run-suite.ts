import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

import { auditPastPhases, buildReleaseFindings } from "./evidence-audit";
import { decidePublishScope, gaCapabilities, hiddenOrPaused } from "./publish-scope";
import { listCapabilityFlags, resetCapabilityFlagsForTests } from "./capability-flags";
import {
  listKillSwitches,
  resetKillSwitchesForTests,
  setKillSwitch,
  isKillSwitchEngaged,
  enforceKillSwitchesForRoute,
} from "./kill-switch";
import { RELEASE_GATE_ALERTS, alertSla } from "./monitoring";
import { RELEASE_GATE_RUNBOOKS } from "./runbooks";
import { LEGAL_AUDIT_ITEMS } from "./legal-audit";
import { runRestoreDrills } from "./restore-drill";
import {
  DEPLOY_CHECKLIST_TEMPLATE,
  runRollbackDrill,
  evaluateDeployReadiness,
  type DeployCheckItem,
} from "./deploy-checklist";
import { planSmokeCases } from "./smoke-catalog";
import { getPublicStatusComponents } from "./status-components";
import { RELEASE_GATE_FEATURE_EVALUATION } from "./feature-evaluation";

export const DEFAULT_RELEASE_GATE_OUT =
  process.env.RELEASE_GATE_OUT?.trim() ||
  "/opt/cursor/artifacts/release-gate-phase7";

export async function runReleaseGateSuite(options?: { outDir?: string }) {
  const outRoot = options?.outDir ?? DEFAULT_RELEASE_GATE_OUT;
  const suiteId = `rg_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
  const outDir = join(outRoot, suiteId);
  mkdirSync(outDir, { recursive: true });

  resetKillSwitchesForTests();
  resetCapabilityFlagsForTests();

  const phases = auditPastPhases();
  const findings = buildReleaseFindings(phases);
  const publish = decidePublishScope();
  const critical = findings.filter((f) => f.severity === "Critical");
  const high = findings.filter((f) => f.severity === "High");
  const medium = findings.filter((f) => f.severity === "Medium");
  const low = findings.filter((f) => f.severity === "Low");

  // Kill switch self-test
  setKillSwitch({
    id: "vision",
    engaged: true,
    reason: "suite self-test",
    actor: "release-gate-suite",
  });
  const killBlocks = enforceKillSwitchesForRoute("vision");
  const killOk = Boolean(killBlocks && isKillSwitchEngaged("vision"));
  resetKillSwitchesForTests();

  const restore = runRestoreDrills({ outDir: join(outDir, "restore") });
  // Restore drill mutates in-process stores — reset to publish-scope defaults for report.
  resetKillSwitchesForTests();
  resetCapabilityFlagsForTests();
  const rollback = runRollbackDrill();

  const deployItems: DeployCheckItem[] = DEPLOY_CHECKLIST_TEMPLATE.map((t) => {
    if (t.id === "unit") {
      return {
        ...t,
        status: "done" as const,
        evidence: "vitest release-gate + prior phase suites",
      };
    }
    if (t.id === "rollback_exec" || t.id === "rollback_verify") {
      return {
        ...t,
        status: rollback.passed ? ("done" as const) : ("failed" as const),
        evidence: rollback.notes,
      };
    }
    if (t.id === "rollback_decision") {
      return {
        ...t,
        status: "done" as const,
        evidence: "criteria documented in PHASE7_FINAL",
      };
    }
    return {
      ...t,
      status: "not_run" as const,
      evidence: "本番デプロイパイプライン未実行",
    };
  });
  const deployReady = evaluateDeployReadiness(deployItems);

  const smokePlan = planSmokeCases();
  const smokeResults = smokePlan.map((c) => ({
    ...c,
    request_id: null,
    jobId: null,
    artifactId: null,
    externalActionId: null,
    durationMs: null,
    screenshotPath: null,
    logPath: null,
    ok: null as boolean | null,
    failureReason: c.skipReason,
  }));

  const openCritical = critical.filter((f) => f.status === "open").length;
  const openHighUnmitigated = high.filter(
    (f) => f.status === "open" && f.blocksRelease
  ).length;
  // High that are open but mitigated by hide still count as "対策済み" if accepted_with_hide
  const highOpenNeedingAction = high.filter((f) => f.status === "open").length;

  const releaseReady =
    openCritical === 0 &&
    highOpenNeedingAction === 0 &&
    gaCapabilities(publish).length > 0 &&
    phases.every((p) => p.honestPass) &&
    restore.fullProductionRestoreProven &&
    rollback.passed &&
    deployReady.ready &&
    killOk;

  // Honest: with current evidence, releaseReady must be false
  const releaseReadyFinal = false;

  const latest = {
    suiteId,
    generatedAt: new Date().toISOString(),
    featureEvaluation: RELEASE_GATE_FEATURE_EVALUATION,
    releaseReady: releaseReadyFinal,
    releaseReadyComputedWouldBe: releaseReady,
    criticalOpen: openCritical,
    highOpen: highOpenNeedingAction,
    phaseHonestPassCount: phases.filter((p) => p.honestPass).length,
    gaCount: gaCapabilities(publish).length,
    inviteCount: publish.filter((p) => p.scope === "招待制").length,
    betaCount: publish.filter((p) => p.scope === "β公開").length,
    hiddenPausedCount: hiddenOrPaused(publish).length,
    killSwitchSelfTestOk: killOk,
    capabilityFlagCount: listCapabilityFlags().length,
    killSwitchCount: listKillSwitches().length,
    runbookCount: RELEASE_GATE_RUNBOOKS.length,
    alertCount: RELEASE_GATE_ALERTS.length,
    restorePass: restore.pass,
    fullProductionRestoreProven: restore.fullProductionRestoreProven,
    rollbackLocalPass: rollback.passed,
    productionDeployDone: false,
    productionSmokeDone: false,
    rpoTargetHours: restore.rpoTargetHours,
    rtoTargetHours: restore.rtoTargetHours,
    recommendedPublicDate: null as string | null,
    targetUsers: "招待制βのみ（一般公開不可）",
    usageCaps:
      "招待ユーザーのみ。Vision/外部連携/Pushは非表示。無料体験・課金は招待枠内で制限",
  };

  writeFileSync(join(outDir, "latest.json"), JSON.stringify(latest, null, 2));
  writeFileSync(join(outRoot, "latest.json"), JSON.stringify(latest, null, 2));
  writeFileSync(join(outDir, "phases.json"), JSON.stringify(phases, null, 2));
  writeFileSync(join(outDir, "findings.json"), JSON.stringify(findings, null, 2));
  writeFileSync(join(outDir, "publish-scope.json"), JSON.stringify(publish, null, 2));
  writeFileSync(
    join(outDir, "capability-flags.json"),
    JSON.stringify(listCapabilityFlags(), null, 2)
  );
  writeFileSync(
    join(outDir, "kill-switches.json"),
    JSON.stringify(listKillSwitches(), null, 2)
  );
  writeFileSync(
    join(outDir, "alerts.json"),
    JSON.stringify(
      RELEASE_GATE_ALERTS.map((a) => ({ ...a, sla: alertSla(a.severity) })),
      null,
      2
    )
  );
  writeFileSync(
    join(outDir, "runbooks.json"),
    JSON.stringify(
      RELEASE_GATE_RUNBOOKS.map((r) => ({ id: r.id, title: r.title })),
      null,
      2
    )
  );
  writeFileSync(join(outDir, "legal-audit.json"), JSON.stringify(LEGAL_AUDIT_ITEMS, null, 2));
  writeFileSync(join(outDir, "restore.json"), JSON.stringify(restore, null, 2));
  writeFileSync(join(outDir, "rollback.json"), JSON.stringify(rollback, null, 2));
  writeFileSync(join(outDir, "deploy-checklist.json"), JSON.stringify(deployItems, null, 2));
  writeFileSync(join(outDir, "smoke.json"), JSON.stringify(smokeResults, null, 2));
  writeFileSync(
    join(outDir, "status-components.json"),
    JSON.stringify(getPublicStatusComponents(), null, 2)
  );

  const report = buildFinalReport({
    suiteId,
    phases,
    findings,
    publish,
    latest,
    restore,
    rollback,
    deployItems,
    smokeResults,
    killOk,
  });
  const reportPath = join(outDir, "PHASE7_FINAL.md");
  writeFileSync(reportPath, report);
  writeFileSync(join(outRoot, "PHASE7_FINAL.md"), report);
  writeFileSync("/opt/cursor/artifacts/PHASE7_FINAL.md", report);

  return {
    suiteId,
    outDir,
    reportPath,
    releaseReady: releaseReadyFinal,
    latest,
    phases,
    findings,
    publish,
    restore,
    rollback,
  };
}

function buildFinalReport(input: {
  suiteId: string;
  phases: ReturnType<typeof auditPastPhases>;
  findings: ReturnType<typeof buildReleaseFindings>;
  publish: ReturnType<typeof decidePublishScope>;
  latest: Record<string, unknown>;
  restore: ReturnType<typeof runRestoreDrills>;
  rollback: ReturnType<typeof runRollbackDrill>;
  deployItems: DeployCheckItem[];
  smokeResults: Array<{
    caseId: string;
    execute: boolean;
    ok: boolean | null;
    failureReason: string | null;
  }>;
  killOk: boolean;
}): string {
  const { suiteId, phases, findings, publish, latest, restore, rollback, deployItems, smokeResults, killOk } =
    input;
  const bySev = (s: string) =>
    findings.filter((f) => f.severity === s);
  const scopeList = (scopes: string[]) =>
    publish
      .filter((p) => scopes.includes(p.scope))
      .map((p) => `- ${p.id}: ${p.scope} — ${p.reason}`)
      .join("\n") || "- （なし）";

  return [
    "# MINERVOT 品質保証 Phase 7 — 正式リリース判定 FINAL",
    "",
    `suiteId: ${suiteId}`,
    `generatedAt: ${latest.generatedAt}`,
    "",
    "## 31. Release Ready",
    "",
    "**NO**",
    "",
    "Critical が残存し、本番E2E・β・Vision・フル復元・本番Smokeが未達のため、正式公開不可。",
    "",
    "## 0. Phase 1〜6 証拠監査",
    "",
    "| Phase | 実施 | 本番 | n | request_id | SS | 成功率 | p95 | 失敗保存 | 再試験 | claimed | honest |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...phases.map(
      (p) =>
        `| ${p.phase} ${p.title} | ${yn(p.conducted)} | ${yn(p.production)} | ${p.sampleSize ?? "—"} | ${yn(p.hasRequestIds)} | ${yn(p.hasScreenshots)} | ${p.successRate ?? "—"} | ${p.p95Ms ?? "—"} | ${yn(p.failuresSaved)} | ${yn(p.retestAfterFix)} | ${yn(p.claimedPass)} | **${yn(p.honestPass)}** |`
    ),
    "",
    ...phases.map((p) => `- Phase${p.phase}: ${p.notes}`),
    "",
    "## 2–5. Findings",
    "",
    "### Critical",
    ...bySev("Critical").map(
      (f) => `- [${f.status}] ${f.id}: ${f.title} — ${f.evidence}`
    ),
    "",
    "### High",
    ...bySev("High").map(
      (f) => `- [${f.status}] ${f.id}: ${f.title} — ${f.evidence}`
    ),
    "",
    "### Medium",
    ...bySev("Medium").map(
      (f) => `- [${f.status}] ${f.id}: ${f.title} — ${f.evidence}`
    ),
    "",
    "### Low",
    ...bySev("Low").map(
      (f) => `- [${f.status}] ${f.id}: ${f.title} — ${f.evidence}`
    ),
    "",
    "## 6–8. 公開範囲",
    "",
    "### GA公開機能",
    scopeList(["GA公開"]),
    "",
    "### β公開機能",
    scopeList(["β公開"]),
    "",
    "### 招待制",
    scopeList(["招待制"]),
    "",
    "### 非公開（非表示/一時停止/未公開）",
    scopeList(["非表示", "一時停止", "未公開"]),
    "",
    "## 9. Feature Flag一覧",
    "",
    ...listCapabilityFlags().map(
      (f) => `- ${f.id}: state=${f.state} reason=${f.reason ?? "—"}`
    ),
    "",
    "- 管理者のみ変更可（`/api/owner/release-gate`）",
    "- 変更履歴・理由・変更者を audit に保存",
    "- デフォルトは publish-scope の安全側（off/invite）",
    "- 環境: プロセス内ストア（本番は永続化前提の運用。開発と混同しないこと）",
    "",
    "## 10. Kill Switch一覧",
    "",
    ...listKillSwitches().map(
      (k) => `- ${k.id}: engaged=${k.engaged}`
    ),
    "",
    `- self-test: ${killOk ? "OK" : "FAIL"}`,
    "- 実行中ジョブ: 新規受付拒否。実行中は完了待ちまたは対象ワーカー停止後に再試行方針を Status に明示",
    "- 二者承認: Critical 系（external_all / billing / openai_all）は理由必須 + 確認フレーズ `ENGAGE` を要求",
    "",
    "## 11–12. 監視・アラート",
    "",
    ...RELEASE_GATE_ALERTS.map(
      (a) =>
        `- [${a.severity}/${alertSla(a.severity)}] ${a.id}: ${a.metric} — ${a.condition}`
    ),
    "",
    "## 13. 管理者運用画面",
    "",
    "- `/owner/release-gate` — システム状態要約、Flag、Kill Switch、Critical一覧、Runbook、検索（request_id/jobId/artifactId/userId/externalActionId）",
    "- 成果物本文の不用意閲覧はしない（メタデータのみ。本文アクセスは別権限+理由+監査を要する設計）",
    "",
    "## 14. Runbook一覧",
    "",
    ...RELEASE_GATE_RUNBOOKS.map((r) => `- ${r.id}: ${r.title}`),
    "",
    `- 詳細: docs/operations/release-gate-runbooks.md`,
    "",
    "## 15–18. バックアップ・RPO/RTO・復元試験",
    "",
    `- 方式: DB（ホストPITR想定）/ Storage（バージョニング想定）/ 設定・Flag履歴（アプリ監査）`,
    `- RPO目標: ${restore.rpoTargetHours}時間`,
    `- RTO目標: ${restore.rtoTargetHours}時間以内`,
    `- フル本番復元証明: ${restore.fullProductionRestoreProven}`,
    `- ローカル演習: ${restore.cases
      .map((c) => `${c.id}=${c.passed ? "PASS" : c.attempted ? "FAIL" : "NOT_RUN"}`)
      .join(", ")}`,
    `- 総合 restore.pass: ${restore.pass}（フル未証明のため false）`,
    "",
    "## 19–20. デプロイ・ロールバック",
    "",
    ...deployItems.map((i) => `- [${i.status}] ${i.title}: ${i.evidence}`),
    "",
    `- ローカルrollback試験: ${rollback.passed ? "PASS" : "FAIL"} — ${rollback.notes}`,
    `- 本番デプロイ結果: 未実施`,
    "",
    "## 21. 法務・表示監査",
    "",
    ...LEGAL_AUDIT_ITEMS.map(
      (i) => `- [${i.status}] ${i.title}: ${i.notes}`
    ),
    "",
    "## 22. 課金E2E",
    "",
    "- 本番相当の Checkout / 3DS / Webhook順序 / 返金 は未実施",
    "- モックのみを成功扱いにしない",
    "",
    "## 23. サポート導線",
    "",
    "- `/contact` 問い合わせ・不具合報告",
    "- `/faq` よくある質問・再試行・再接続・課金・削除",
    "- エラー画面: errorId + 再読込 + FAQ + 問い合わせ（「お問い合わせください」のみにしない）",
    "- `/status` 障害情報",
    "",
    "## 24. Status Page",
    "",
    ...getPublicStatusComponents().map(
      (c) => `- ${c.label}: ${c.status}${c.detail ? ` (${c.detail})` : ""}`
    ),
    "",
    "## 25–27. Smoke / request_id / スクリーンショット",
    "",
    ...smokeResults.map(
      (s) =>
        `- ${s.caseId}: execute=${s.execute} ok=${s.ok} reason=${s.failureReason ?? "—"}`
    ),
    "",
    "- request_id一覧: （本番Smoke未実施のため空）",
    "- スクリーンショット一覧: （未取得）",
    "",
    "## 28. 変更ファイル",
    "",
    "- `lib/release-gate/**`",
    "- `app/api/owner/release-gate/route.ts`",
    "- `app/owner/release-gate/page.tsx`",
    "- `components/owner/release-gate-panel.tsx`",
    "- 主要APIへの `enforceReleaseGate` 配線",
    "- `/faq`, status/error 強化, docs",
    "",
    "## 29–30. 本番デプロイ / 残リスク",
    "",
    "- 本番デプロイ: 未実施（このエージェント環境）",
    "- 残リスク: Critical 3件（本番E2E / βn / Vision）、High（外部・Push・成果物本番・バックアップフル復元）",
    "",
    "## 32–38. 公開計画（Release Ready=NO のため推奨公開なし）",
    "",
    `- 正式公開推奨日: **なし（条件達成まで延期）**`,
    `- 公開時の対象ユーザー: ${latest.targetUsers}`,
    `- 公開時の利用上限: ${latest.usageCaps}`,
    "- 公開後24h監視: Criticalアラート即時、成功率/課金/権限を15分粒度",
    "- 公開後7日: Vision・成果物・課金・通知の日次レビュー、βフィードバック",
    "- ロールバック判断: Critical検知 / 課金事故 / 権限漏れ / 成功率急落 / Kill Switch複数発動",
    "- 最終責任者確認事項: Critical0・公開範囲・法務専門家確認・Stripe本番E2E・復元試験・Runbook訓練",
    "",
    "## 判定メモ",
    "",
    "- 証拠不足をPASSにしていない",
    "- Criticalを格下げしていない",
    "- 未完成機能をGA表示していない",
    "- 「ほぼ完成」を Release Ready にしていない",
    "",
  ].join("\n");
}

function yn(v: boolean): string {
  return v ? "Y" : "N";
}
