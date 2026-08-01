import type {
  ConcurrentBatchResult,
  OpsDurabilityAggregate,
  OpsExternalResult,
  OpsFailureClass,
  OpsJobResult,
  OpsNotificationResult,
  OpsStorageResult,
} from "@/lib/ops-durability/types";

function rate(success: number, total: number): number | null {
  if (total <= 0) return null;
  return success / total;
}

function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx]!;
}

export function aggregateOpsDurability(input: {
  jobs: OpsJobResult[];
  notifications: OpsNotificationResult[];
  storage: OpsStorageResult[];
  external: OpsExternalResult[];
  concurrent: ConcurrentBatchResult[];
  productionJobs: number;
}): OpsDurabilityAggregate {
  const countedJobs = input.jobs.filter((j) => j.countedInSuccessRate);
  const completed = countedJobs.filter(
    (j) => j.ok && j.statusFinal === "completed"
  ).length;
  // Scenario "ok" that aren't completed (cancel/timeout/needs_input correctness)
  const scenarioOk = countedJobs.filter(
    (j) =>
      j.ok &&
      j.statusFinal !== "completed" &&
      ["timeout_scenario", "cancel_scenario", "needs_input_scenario", "idempotency_scenario"].includes(
        j.category
      )
  ).length;
  const successLike = completed + scenarioOk;
  const failed = countedJobs.filter((j) => !j.ok).length;
  const retried = countedJobs.filter((j) => j.retryCount > 0);
  const retryThenSuccess = retried.filter((j) => j.ok).length;
  const stuck = countedJobs.filter(
    (j) => j.failureClass === "stuck_job" || j.statusFinal === "running"
  ).length;
  const dupKeys = new Map<string, number>();
  for (const j of input.jobs) {
    dupKeys.set(j.idempotencyKey, (dupKeys.get(j.idempotencyKey) ?? 0) + 1);
  }
  const duplicateJobs = [...dupKeys.values()].filter((n) => n > 1).length;

  const durations = countedJobs
    .map((j) => j.durationMs)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const queueWaits = countedJobs
    .map((j) => j.queueWaitMs)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);

  const nCreate = input.notifications.filter((n) => n.okCreate).length;
  const nPushEligible = input.notifications.filter((n) => n.okCreate);
  // Push success among creates that attempted delivery — unconfigured pushOk=false
  const nPushOk = nPushEligible.filter((n) => n.okPush).length;
  const delays = input.notifications
    .map((n) => n.delayMs)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);

  const storUpload = input.storage.filter((s) => s.okUpload).length;
  const storDownload = input.storage.filter((s) => s.okDownload).length;
  const zeroByte = input.storage.filter((s) => s.zeroByte).length;
  const orphan = input.storage.filter((s) => s.orphan).length;
  const leaks = input.storage.filter((s) => s.crossUserLeak).length;

  const byService: OpsDurabilityAggregate["external"]["byService"] = {};
  for (const e of input.external) {
    const bucket = byService[e.service] ?? {
      total: 0,
      counted: 0,
      success: 0,
      rate: null,
    };
    bucket.total += 1;
    if (e.countedInSuccessRate) {
      bucket.counted += 1;
      if (e.ok) bucket.success += 1;
    }
    bucket.rate = rate(bucket.success, bucket.counted);
    byService[e.service] = bucket;
  }
  const tokenRefreshCases = input.external.filter(
    (e) => e.tokenRefresh === "success" || e.tokenRefresh === "failed"
  );
  const tokenRefreshOk = tokenRefreshCases.filter(
    (e) => e.tokenRefresh === "success"
  ).length;

  const failCounts = new Map<OpsFailureClass, number>();
  for (const row of [
    ...input.jobs,
    ...input.notifications,
    ...input.storage,
    ...input.external,
  ]) {
    const cls =
      "failureClass" in row && row.failureClass
        ? (row.failureClass as OpsFailureClass)
        : null;
    if (!cls) continue;
    if ("ok" in row && row.ok) continue;
    if ("okCreate" in row && row.okCreate && cls === "push_failed") {
      // still count push failures
    }
    failCounts.set(cls, (failCounts.get(cls) ?? 0) + 1);
  }

  const jobsCompletedRate = rate(successLike, countedJobs.length);
  const createRate = rate(nCreate, input.notifications.length);
  const uploadRate = rate(storUpload, input.storage.length);
  const downloadRate = rate(storDownload, input.storage.length);

  const reasons: string[] = [];
  if (input.jobs.length < 500) reasons.push(`jobs n=${input.jobs.length} < 500`);
  if (input.notifications.length < 500)
    reasons.push(`notifications n=${input.notifications.length} < 500`);
  if (input.storage.length < 1000)
    reasons.push(`storage n=${input.storage.length} < 1000`);
  if ((jobsCompletedRate ?? -1) < 0.99)
    reasons.push(`job completed率 ${(jobsCompletedRate ?? 0) * 100}% < 99%`);
  if (stuck > 0) reasons.push(`stuck job ${stuck}`);
  if (duplicateJobs > 0) reasons.push(`duplicate jobs ${duplicateJobs}`);
  if ((createRate ?? -1) < 0.999)
    reasons.push(`notification create ${(createRate ?? 0) * 100}% < 99.9%`);
  // Push: without VAPID/subscriptions, pushOk will be false — honest FAIL
  const pushRate = rate(nPushOk, nPushEligible.length);
  if ((pushRate ?? -1) < 0.99)
    reasons.push(
      `Push成功率 ${(pushRate ?? 0) * 100}% < 99% (VAPID/subscription 不足の可能性)`
    );
  if (input.notifications.some((n) => n.prematureComplete))
    reasons.push("誤完了通知あり");
  if ((uploadRate ?? -1) < 0.999)
    reasons.push(`Storage upload ${(uploadRate ?? 0) * 100}% < 99.9%`);
  if ((downloadRate ?? -1) < 0.999)
    reasons.push(`Storage download ${(downloadRate ?? 0) * 100}% < 99.9%`);
  if (zeroByte > 0) reasons.push(`0バイト ${zeroByte}`);
  if (leaks > 0) reasons.push(`permission leak ${leaks}`);
  if (input.productionJobs < 1)
    reasons.push("本番ジョブ未実行（PRODUCTION_E2E 不足）");
  const anyExternalCounted = Object.values(byService).some((s) => s.counted > 0);
  if (!anyExternalCounted)
    reasons.push("外部連携E2E未接続（成功率分母=0、未接続を成功扱いせず）");
  if (input.concurrent.length < 5)
    reasons.push("同時実行試験段階不足");

  return {
    jobs: {
      total: input.jobs.length,
      counted: countedJobs.length,
      completed: successLike,
      failed,
      completedRate: jobsCompletedRate,
      failedRate: rate(failed, countedJobs.length),
      retryRate: rate(retried.length, countedJobs.length),
      retryThenSuccessRate: rate(retryThenSuccess, retried.length),
      stuckRate: rate(stuck, countedJobs.length),
      duplicateRate: rate(duplicateJobs, input.jobs.length),
      avgMs:
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : null,
      p90Ms: pct(durations, 90),
      p95Ms: pct(durations, 95),
      p99Ms: pct(durations, 99),
      avgQueueWaitMs:
        queueWaits.length > 0
          ? queueWaits.reduce((a, b) => a + b, 0) / queueWaits.length
          : null,
    },
    notifications: {
      total: input.notifications.length,
      createRate,
      pushRate,
      emailRate: rate(
        input.notifications.filter((n) => n.okEmail).length,
        0 // email channel unimplemented — denom 0 → null
      ),
      avgDelayMs:
        delays.length > 0
          ? delays.reduce((a, b) => a + b, 0) / delays.length
          : null,
      p95DelayMs: pct(delays, 95),
      duplicateRate: rate(
        input.notifications.filter((n) => n.duplicate).length,
        input.notifications.length
      ),
      prematureCompleteCount: input.notifications.filter(
        (n) => n.prematureComplete
      ).length,
    },
    storage: {
      total: input.storage.length,
      uploadRate,
      downloadRate,
      signedUrlRate: null,
      zeroByteRate: rate(zeroByte, input.storage.length),
      orphanRate: rate(orphan, input.storage.length),
      permissionLeakCount: leaks,
    },
    external: {
      byService,
      duplicateActionCount: input.external.filter((e) => e.duplicatePrevented)
        .length,
      tokenRefreshSuccessRate: rate(
        tokenRefreshOk,
        tokenRefreshCases.length
      ),
    },
    concurrent: input.concurrent,
    failureRanking: [...failCounts.entries()]
      .map(([cls, count]) => ({ class: cls, count }))
      .sort((a, b) => b.count - a.count),
    phase3Pass: reasons.length === 0,
    phase3FailReasons: reasons,
    productionJobsPerCategory: input.productionJobs,
  };
}
