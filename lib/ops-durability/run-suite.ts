import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

import { resetArtifactIdempotencyForTests } from "@/lib/artifact-platform";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetDeliverableVersionsForTests } from "@/lib/deliverables/versioning";
import { resetAutomationJobStoreForTests } from "@/lib/jobs/job-store";
import { resetJobTransitionHistoryForTests } from "@/lib/jobs/transitions";
import { aggregateOpsDurability } from "@/lib/ops-durability/aggregate";
import { captureOpsScreenshots } from "@/lib/ops-durability/capture-screenshots";
import {
  assertOpsJobCaseCounts,
  OPS_JOB_CASES,
} from "@/lib/ops-durability/cases";
import { inspectOpsDurabilityEnv } from "@/lib/ops-durability/env-check";
import { resetExternalActionLedgerForTests } from "@/lib/ops-durability/external-idempotency";
import { runConcurrentBatches } from "@/lib/ops-durability/run-concurrent";
import { runExternalDurability } from "@/lib/ops-durability/run-external";
import { runOpsJobCase } from "@/lib/ops-durability/run-job";
import { runNotificationDurability } from "@/lib/ops-durability/run-notifications";
import { runOpsScenarioJobs } from "@/lib/ops-durability/run-scenarios";
import { runStorageDurability } from "@/lib/ops-durability/run-storage";

export const DEFAULT_OPS_DURABILITY_OUT =
  process.env.OPS_DURABILITY_OUT?.trim() ||
  "/opt/cursor/artifacts/ops-durability";

function fmt(n: number | null | undefined): string {
  if (n == null) return "未計測";
  return `${(n * 100).toFixed(2)}%`;
}

export async function runOpsDurabilitySuite(options?: {
  outDir?: string;
  jobLimit?: number;
  notificationCount?: number;
  storageCount?: number;
  concurrentLevels?: number[];
}): Promise<{
  suiteId: string;
  outDir: string;
  reportPath: string;
  aggregate: ReturnType<typeof aggregateOpsDurability>;
  env: ReturnType<typeof inspectOpsDurabilityEnv>;
}> {
  const env = inspectOpsDurabilityEnv();
  const suiteId = `ops_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
  const outDir = join(options?.outDir ?? DEFAULT_OPS_DURABILITY_OUT, suiteId);
  mkdirSync(outDir, { recursive: true });

  assertOpsJobCaseCounts();
  resetAutomationJobStoreForTests();
  resetJobTransitionHistoryForTests();
  resetExternalActionLedgerForTests();
  resetDurableDeliverableStoreForTests();
  resetDeliverableVersionsForTests();
  resetArtifactIdempotencyForTests();

  writeFileSync(join(outDir, "env-report.json"), JSON.stringify(env, null, 2));
  writeFileSync(join(outDir, "AUDIT.md"), buildAuditMarkdown(), "utf8");

  const userId = "ops_durability_user";
  const otherUserId = "ops_durability_other";
  const jobLimit = options?.jobLimit ?? 500;
  const cases = OPS_JOB_CASES.slice(0, jobLimit);

  const jobs = [];
  for (const c of cases) {
    jobs.push(
      await runOpsJobCase(c, {
        userId,
        otherUserId,
        openaiAvailable: env.openai,
      })
    );
  }
  jobs.push(...(await runOpsScenarioJobs(userId)));

  const notifications = await runNotificationDurability({
    userId,
    count: options?.notificationCount ?? 500,
  });

  const storage = await runStorageDurability({
    userId,
    otherUserId,
    count: options?.storageCount ?? 1000,
  });

  const external = await runExternalDurability({ userId });

  const concurrent = await runConcurrentBatches({
    userId,
    baseCases: OPS_JOB_CASES.filter((c) => c.category === "deliverable_generate"),
    levels: options?.concurrentLevels ?? [5, 10, 20, 50, 100],
  });

  const productionJobs = env.canRunProductionHttp ? 0 : 0; // honest: not run

  const aggregate = aggregateOpsDurability({
    jobs,
    notifications,
    storage,
    external,
    concurrent,
    productionJobs,
  });

  if (!env.canRunProductionHttp) {
    aggregate.phase3Pass = false;
    if (
      !aggregate.phase3FailReasons.some((r) => /本番/.test(r) || /PRODUCTION/.test(r))
    ) {
      aggregate.phase3FailReasons.push(
        "本番E2E未実行（PRODUCTION_E2E_BASE_URL/Clerk/Supabase/CRON_SECRET）"
      );
    }
  }

  writeFileSync(join(outDir, "jobs.json"), JSON.stringify(jobs, null, 2));
  writeFileSync(
    join(outDir, "notifications.json"),
    JSON.stringify(notifications, null, 2)
  );
  writeFileSync(join(outDir, "storage.json"), JSON.stringify(storage, null, 2));
  writeFileSync(join(outDir, "external.json"), JSON.stringify(external, null, 2));
  writeFileSync(
    join(outDir, "concurrent.json"),
    JSON.stringify(concurrent, null, 2)
  );
  writeFileSync(
    join(outDir, "aggregate.json"),
    JSON.stringify(aggregate, null, 2)
  );

  const pickJob = (pred: (j: (typeof jobs)[0]) => boolean) =>
    jobs.find(pred) ?? jobs[0]!;

  const screenshots = await captureOpsScreenshots({
    outDir,
    panels: [
      {
        label: "job_completed",
        title: "正常ジョブ完了",
        rows: rowsFromJob(pickJob((j) => j.statusFinal === "completed" && j.ok)),
      },
      {
        label: "job_retry_success",
        title: "retry後成功",
        rows: rowsFromJob(
          pickJob((j) => j.category === "retry_scenario" || j.retryCount > 0)
        ),
      },
      {
        label: "job_timeout_failed",
        title: "timeout後失敗",
        rows: rowsFromJob(pickJob((j) => j.category === "timeout_scenario")),
      },
      {
        label: "job_needs_input",
        title: "needs_input",
        rows: rowsFromJob(pickJob((j) => j.category === "needs_input_scenario")),
      },
      {
        label: "notification_create",
        title: "通知作成",
        rows: [
          ["okCreate", String(notifications.filter((n) => n.okCreate).length)],
          ["total", String(notifications.length)],
          ["pushOk", String(notifications.filter((n) => n.okPush).length)],
          ["emailOk", "0 (channel unimplemented)"],
        ],
      },
      {
        label: "notification_push_gap",
        title: "通知Push（未設定は失敗扱い）",
        rows: [
          ["pushRate", fmt(aggregate.notifications.pushRate)],
          ["note", "VAPID/subscription なし → Push成功率ゲート FAIL"],
        ],
      },
      {
        label: "external_x_blocked",
        title: "X投稿（未接続）",
        rows: [
          ["connected", "false"],
          ["countedInSuccess", "false"],
          ["note", "未接続を成功扱いにしない"],
        ],
      },
      {
        label: "external_gmail_blocked",
        title: "Gmail（未接続）",
        rows: [
          ["connected", "false"],
          ["countedInSuccess", "false"],
        ],
      },
      {
        label: "external_calendar_blocked",
        title: "Calendar（未接続）",
        rows: [["connected", "false"]],
      },
      {
        label: "external_dropbox_blocked",
        title: "Dropbox（未接続）",
        rows: [["connected", "false"]],
      },
      {
        label: "idempotency_dedupe",
        title: "重複防止",
        rows: rowsFromJob(
          pickJob((j) => j.category === "idempotency_scenario")
        ),
      },
      {
        label: "production_blocked",
        title: "本番E2Eブロック",
        rows: env.blockers.map((b, i) => [`blocker_${i + 1}`, b]),
      },
    ],
  });

  const reportPath = join(outDir, "PHASE3_REPORT.md");
  const finalPath = join(outDir, "PHASE3_FINAL.md");
  const report = buildFinalReport({
    suiteId,
    env,
    aggregate,
    jobs,
    notifications,
    storage,
    external,
    screenshots,
  });
  writeFileSync(reportPath, report, "utf8");
  writeFileSync(finalPath, report, "utf8");
  writeFileSync(
    join(outDir, "BEFORE_AFTER.md"),
    [
      "# Before / After",
      "",
      "## Before",
      "- ジョブ/通知/Storage/外部連携: 未計測 or n=1 自己申告",
      "",
      "## After",
      `- jobs: completed=${fmt(aggregate.jobs.completedRate)} (n=${aggregate.jobs.counted}/${aggregate.jobs.total})`,
      `- notifications create: ${fmt(aggregate.notifications.createRate)}`,
      `- push: ${fmt(aggregate.notifications.pushRate)}`,
      `- storage upload: ${fmt(aggregate.storage.uploadRate)}`,
      `- external connected counted: ${Object.values(aggregate.external.byService).reduce((a, s) => a + s.counted, 0)}`,
      `- phase3: ${aggregate.phase3Pass ? "PASS" : "FAIL"}`,
      "",
    ].join("\n"),
    "utf8"
  );

  writeFileSync(
    join(options?.outDir ?? DEFAULT_OPS_DURABILITY_OUT, "latest.json"),
    JSON.stringify(
      {
        suiteId,
        reportPath: finalPath,
        phase3Pass: aggregate.phase3Pass,
        jobs: {
          n: aggregate.jobs.total,
          completedRate: aggregate.jobs.completedRate,
          p95Ms: aggregate.jobs.p95Ms,
        },
        notifications: {
          n: aggregate.notifications.total,
          createRate: aggregate.notifications.createRate,
          pushRate: aggregate.notifications.pushRate,
        },
        storage: {
          n: aggregate.storage.total,
          uploadRate: aggregate.storage.uploadRate,
        },
      },
      null,
      2
    ),
    "utf8"
  );

  return { suiteId, outDir, reportPath: finalPath, aggregate, env };
}

function rowsFromJob(j: {
  caseId: string;
  requestId: string;
  jobId: string | null;
  statusFinal: string | null;
  ok: boolean;
  retryCount: number;
  artifactId: string | null;
}): Array<[string, string]> {
  return [
    ["caseId", j.caseId],
    ["request_id", j.requestId],
    ["jobId", j.jobId ?? "null"],
    ["status", j.statusFinal ?? "null"],
    ["ok", String(j.ok)],
    ["retryCount", String(j.retryCount)],
    ["artifactId", j.artifactId ?? "null"],
  ];
}

function buildAuditMarkdown(): string {
  return [
    "# Phase 3 現状監査サマリ",
    "",
    "## 分類",
    "- 未実装: 通知メールチャネル、DLQリプレイ、署名付きURLメトリクス",
    "- timeout不足→修正: Gmail/Calendar api-client に fetchWithTimeout",
    "- retry不足→修正: integrations/retry が非retryableを再試行しない + jitter",
    "- 状態不整合→修正: transitions 厳格化、markJobCancelled、pushStatus同期",
    "- ログ不足→修正: X OAuth audit",
    "- 重複実行リスク→追加: external action ledger",
    "- 本番未確認: PRODUCTION_E2E / 連携アカウントなし → Phase3 FAIL",
    "",
  ].join("\n");
}

function buildFinalReport(input: {
  suiteId: string;
  env: ReturnType<typeof inspectOpsDurabilityEnv>;
  aggregate: ReturnType<typeof aggregateOpsDurability>;
  jobs: Awaited<ReturnType<typeof runOpsJobCase>>[];
  notifications: Awaited<ReturnType<typeof runNotificationDurability>>;
  storage: Awaited<ReturnType<typeof runStorageDurability>>;
  external: Awaited<ReturnType<typeof runExternalDurability>>;
  screenshots: Array<{ label: string; path: string | null; note: string }>;
}): string {
  const a = input.aggregate;
  return [
    "# MINERVOT Ops Durability Phase 3 — FINAL",
    "",
    `suiteId: ${input.suiteId}`,
    `generatedAt: ${new Date().toISOString()}`,
    "",
    "## 1. 評価環境",
    `- local: YES`,
    `- production HTTP: ${input.env.canRunProductionHttp ? "YES" : "NO"}`,
    `- blockers: ${input.env.blockers.join(" | ") || "none"}`,
    "",
    "## 2. 総ジョブ件数",
    `- total=${a.jobs.total} counted=${a.jobs.counted}`,
    "",
    "## 3. completed率",
    fmt(a.jobs.completedRate),
    "",
    "## 4. failed率",
    fmt(a.jobs.failedRate),
    "",
    "## 5. retry率",
    fmt(a.jobs.retryRate),
    "",
    "## 6. retry後成功率",
    fmt(a.jobs.retryThenSuccessRate),
    "",
    "## 7. stuck率",
    fmt(a.jobs.stuckRate),
    "",
    "## 8. duplicate率",
    fmt(a.jobs.duplicateRate),
    "",
    "## 9. 平均・p90・p95・p99",
    `- avg=${a.jobs.avgMs?.toFixed(0) ?? "—"} p90=${a.jobs.p90Ms?.toFixed(0) ?? "—"} p95=${a.jobs.p95Ms?.toFixed(0) ?? "—"} p99=${a.jobs.p99Ms?.toFixed(0) ?? "—"} queueWaitAvg=${a.jobs.avgQueueWaitMs?.toFixed(0) ?? "—"}`,
    "",
    "## 10. 通知成功率",
    `- create=${fmt(a.notifications.createRate)} push=${fmt(a.notifications.pushRate)} email=${fmt(a.notifications.emailRate)}`,
    "",
    "## 11. 通知遅延",
    `- avg=${a.notifications.avgDelayMs?.toFixed(0) ?? "—"} p95=${a.notifications.p95DelayMs?.toFixed(0) ?? "—"}`,
    "",
    "## 12. Storage成功率",
    `- upload=${fmt(a.storage.uploadRate)} download=${fmt(a.storage.downloadRate)} zeroByte=${fmt(a.storage.zeroByteRate)}`,
    "",
    "## 13. permission leak",
    String(a.storage.permissionLeakCount),
    "",
    "## 14. 外部連携別成功率（接続済みのみ分母）",
    ...Object.entries(a.external.byService).map(
      ([k, v]) => `- ${k}: ${fmt(v.rate)} (counted=${v.counted}/${v.total})`
    ),
    "",
    "## 15. token refresh",
    fmt(a.external.tokenRefreshSuccessRate),
    "",
    "## 16. 失敗原因ランキング",
    ...(a.failureRanking.length
      ? a.failureRanking.slice(0, 20).map((f) => `- ${f.class}: ${f.count}`)
      : ["- (none)"]),
    "",
    "## 17. 変更ファイル一覧",
    "- lib/ops-durability/*",
    "- lib/jobs/{transitions,reliability,retry-classifier}.ts",
    "- lib/integrations/retry.ts",
    "- lib/integrations/google/{gmail,calendar}/api-client.ts",
    "- lib/notifications/delivery.ts",
    "- lib/reliability/{retry,timeouts}.ts",
    "- app/api/external-services/x/oauth/callback/route.ts",
    "",
    "## 18. 修正内容",
    "- 状態遷移ガード + 履歴",
    "- Gmail/Calendar timeout",
    "- integration retry 分類 + jitter",
    "- job cancel / pushStatus 同期 / X audit",
    "- 外部アクション idempotency ledger",
    "",
    "## 19. スクリーンショット一覧",
    ...input.screenshots.map((s) => `- ${s.label}: ${s.path ?? "null"} (${s.note})`),
    "",
    "## 20. request_id一覧（先頭60）",
    ...input.jobs.slice(0, 40).map((j) => `- ${j.caseId}: ${j.requestId}`),
    ...input.notifications.slice(0, 20).map((n) => `- ${n.caseId}: ${n.requestId}`),
    "",
    "## 21. 改善前後比較",
    "- Before: 未計測 / n=1",
    `- After jobs completed=${fmt(a.jobs.completedRate)} n=${a.jobs.total}`,
    "",
    "## 22. 未達項目",
    ...a.phase3FailReasons.map((r) => `- ${r}`),
    "",
    "## 23. 残るCritical",
    "- production_e2e_unverified",
    "- external integrations not connected in agent",
    "- push channel unconfigured",
    "- email notification channel unimplemented",
    "",
    "## 24. 本番デプロイ結果",
    "- 未デプロイ（計測ハーネス + 信頼性修正）",
    "",
    "## 25. ロールバック方法",
    "- git revert of ops-durability / jobs / integrations timeout+retry commits",
    "",
    "## 26. Phase 3合格判定",
    "",
    `**${a.phase3Pass ? "PASS" : "FAIL"}**`,
    "",
    "## Concurrent",
    ...a.concurrent.map(
      (c) =>
        `- c=${c.concurrency}: success=${(c.successRate * 100).toFixed(1)}% p95=${c.p95Ms.toFixed(0)} stuck=${c.stuckCount}`
    ),
    "",
  ].join("\n");
}
