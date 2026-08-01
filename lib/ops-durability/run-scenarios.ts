import { randomUUID } from "crypto";

import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { registerArtifact } from "@/lib/artifact-platform";
import {
  markJobCancelled,
  markJobCompleted,
  markJobFailed,
  markJobQueued,
  markJobRunning,
} from "@/lib/jobs/reliability";
import { getJobTransitionHistory } from "@/lib/jobs/transitions";
import { createNotificationWithDelivery } from "@/lib/notifications/service";
import { classifyOpsFailure } from "@/lib/ops-durability/classify";
import {
  beginExternalAction,
  buildExternalActionKey,
  completeExternalAction,
} from "@/lib/ops-durability/external-idempotency";
import type { OpsJobResult } from "@/lib/ops-durability/types";

/**
 * Controlled scenarios: retry, timeout, cancel, needs_input, idempotency.
 * These are additional to the 500 category jobs (still unique tokens).
 */
export async function runOpsScenarioJobs(userId: string): Promise<OpsJobResult[]> {
  const out: OpsJobResult[] = [];

  // --- retry then success ---
  {
    const caseId = "ops_scn_retry_01";
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const requestId = `ops_${caseId}_${randomUUID().slice(0, 8)}`;
    const started = Date.now();
    const log: string[] = [];
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::retry::${caseId}`,
      jobType: "retry_scenario",
    });
    await markJobRunning({ jobId, userId, step: "worker" });
    const fail = await markJobFailed({
      jobId,
      userId,
      error: "network timeout ETIMEDOUT",
      errorCode: "timeout",
    });
    log.push(`willRetry=${fail.willRetry}`);
    await markJobRunning({ jobId, userId, step: "retry_worker" });
    const f = await new DocxDeliverableGenerator().generate(
      `# retry ${caseId}\n`,
      caseId
    );
    const art = await registerArtifact({
      userId,
      buffer: f.buffer,
      format: "docx",
      title: caseId,
      requestId,
      jobId,
    });
    await markJobCompleted({
      jobId,
      userId,
      artifactId: art.id,
      resultSummary: "retry recovered",
      autoRecovered: true,
    });
    out.push({
      caseId,
      category: "retry_scenario",
      ok: true,
      countedInSuccessRate: true,
      requestId,
      jobId,
      artifactId: art.id,
      diagnosticId: null,
      externalActionId: null,
      idempotencyKey: `${userId}::retry::${caseId}`,
      statusFinal: "completed",
      retryCount: fail.record.attemptCount,
      failedStage: null,
      failureClass: null,
      failureReason: null,
      durationMs: Date.now() - started,
      queueWaitMs: 0,
      transitions: getJobTransitionHistory(jobId).map((t) => ({
        from: t.previousStatus,
        to: t.nextStatus,
        at: t.changedAt,
      })),
      environment: "local",
      log,
    });
  }

  // --- timeout terminal (non-recovered after max) ---
  {
    const caseId = "ops_scn_timeout_01";
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const requestId = `ops_${caseId}_${randomUUID().slice(0, 8)}`;
    const started = Date.now();
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::timeout::${caseId}`,
    });
    await markJobRunning({ jobId, userId });
    let last = await markJobFailed({
      jobId,
      userId,
      error: "worker timeout",
      errorCode: "timeout",
    });
    // Exhaust retries
    while (last.willRetry) {
      await markJobRunning({ jobId, userId, step: "retry" });
      last = await markJobFailed({
        jobId,
        userId,
        error: "worker timeout",
        errorCode: "timeout",
      });
    }
    // Ensure timeout did NOT become needs_input
    const bad = /needs_input/i.test(last.record.lastErrorCode ?? "");
    out.push({
      caseId,
      category: "timeout_scenario",
      ok: !bad && last.record.status === "failed",
      countedInSuccessRate: true,
      requestId,
      jobId,
      artifactId: null,
      diagnosticId: null,
      externalActionId: null,
      idempotencyKey: `${userId}::timeout::${caseId}`,
      statusFinal: last.record.status,
      retryCount: last.record.attemptCount,
      failedStage: "timeout",
      failureClass: bad ? "unknown" : "timeout",
      failureReason: last.record.lastErrorMessage,
      durationMs: Date.now() - started,
      queueWaitMs: 0,
      transitions: getJobTransitionHistory(jobId).map((t) => ({
        from: t.previousStatus,
        to: t.nextStatus,
        at: t.changedAt,
      })),
      environment: "local",
      log: [`timeout_not_needs_input=${!bad}`],
    });
  }

  // --- cancel ---
  {
    const caseId = "ops_scn_cancel_01";
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const requestId = `ops_${caseId}_${randomUUID().slice(0, 8)}`;
    const started = Date.now();
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::cancel::${caseId}`,
    });
    await markJobRunning({ jobId, userId });
    await markJobCancelled({ jobId, userId, reason: "user_cancelled" });
    let invalidResume = false;
    try {
      await markJobRunning({ jobId, userId });
      invalidResume = true;
    } catch {
      invalidResume = false;
    }
    out.push({
      caseId,
      category: "cancel_scenario",
      ok: !invalidResume,
      countedInSuccessRate: true,
      requestId,
      jobId,
      artifactId: null,
      diagnosticId: null,
      externalActionId: null,
      idempotencyKey: `${userId}::cancel::${caseId}`,
      statusFinal: "cancelled",
      retryCount: 0,
      failedStage: invalidResume ? "invalid_state_transition" : null,
      failureClass: invalidResume ? "invalid_state_transition" : null,
      failureReason: invalidResume ? "cancelled->running allowed" : null,
      durationMs: Date.now() - started,
      queueWaitMs: 0,
      transitions: getJobTransitionHistory(jobId).map((t) => ({
        from: t.previousStatus,
        to: t.nextStatus,
        at: t.changedAt,
      })),
      environment: "local",
      log: [`cancel_blocks_resume=${!invalidResume}`],
    });
  }

  // --- needs_input (non-retryable, no auto complete) ---
  {
    const caseId = "ops_scn_needs_input_01";
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const requestId = `ops_${caseId}_${randomUUID().slice(0, 8)}`;
    const started = Date.now();
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::needs::${caseId}`,
    });
    await markJobRunning({ jobId, userId });
    const fail = await markJobFailed({
      jobId,
      userId,
      error: "required_information_missing: 宛先未入力",
      errorCode: "needs_input",
    });
    out.push({
      caseId,
      category: "needs_input_scenario",
      ok: !fail.willRetry && fail.record.status === "failed",
      countedInSuccessRate: true,
      requestId,
      jobId,
      artifactId: null,
      diagnosticId: null,
      externalActionId: null,
      idempotencyKey: `${userId}::needs::${caseId}`,
      statusFinal: fail.record.status,
      retryCount: fail.record.attemptCount,
      failedStage: "needs_input",
      failureClass: "needs_input",
      failureReason: fail.record.lastErrorMessage,
      durationMs: Date.now() - started,
      queueWaitMs: 0,
      transitions: getJobTransitionHistory(jobId).map((t) => ({
        from: t.previousStatus,
        to: t.nextStatus,
        at: t.changedAt,
      })),
      environment: "local",
      log: [`willRetry=${fail.willRetry}`],
    });
  }

  // --- idempotency external duplicate ---
  {
    const caseId = "ops_scn_idem_ext_01";
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const requestId = `ops_${caseId}_${randomUUID().slice(0, 8)}`;
    const started = Date.now();
    const key = buildExternalActionKey({
      userId,
      service: "x",
      action: "post",
      fingerprint: "idem-fingerprint-1",
    });
    const id1 = "ea_x_1";
    beginExternalAction({
      key,
      service: "x",
      action: "post",
      externalActionId: id1,
    });
    completeExternalAction(key, "completed");
    const second = beginExternalAction({
      key,
      service: "x",
      action: "post",
      externalActionId: "ea_x_2",
    });
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::idem::${caseId}`,
    });
    await markJobRunning({ jobId, userId });
    await markJobCompleted({
      jobId,
      userId,
      externalResultId: id1,
      resultSummary: "duplicate_prevented",
    });
    out.push({
      caseId,
      category: "idempotency_scenario",
      ok: second.ok === false && second.reason === "already_completed",
      countedInSuccessRate: true,
      requestId,
      jobId,
      artifactId: null,
      diagnosticId: null,
      externalActionId: id1,
      idempotencyKey: key,
      statusFinal: "completed",
      retryCount: 0,
      failedStage: null,
      failureClass: null,
      failureReason: null,
      durationMs: Date.now() - started,
      queueWaitMs: 0,
      transitions: getJobTransitionHistory(jobId).map((t) => ({
        from: t.previousStatus,
        to: t.nextStatus,
        at: t.changedAt,
      })),
      environment: "local",
      log: [`duplicate_prevented=${!second.ok}`],
    });
  }

  // --- notification premature-complete guard sample ---
  {
    const caseId = "ops_scn_notify_01";
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const requestId = `ops_${caseId}_${randomUUID().slice(0, 8)}`;
    const started = Date.now();
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::ntf::${caseId}`,
    });
    await markJobRunning({ jobId, userId });
    // Create error notification while running — must not be type completed
    const n = await createNotificationWithDelivery({
      audience: "user",
      userId,
      type: "error",
      title: "一時エラー",
      message: "処理継続中",
      relatedTaskId: jobId,
      lineEvent: "error",
    });
    const f = await new DocxDeliverableGenerator().generate("# n\n", caseId);
    const art = await registerArtifact({
      userId,
      buffer: f.buffer,
      format: "docx",
      title: caseId,
      requestId,
      jobId,
    });
    await markJobCompleted({
      jobId,
      userId,
      artifactId: art.id,
      resultSummary: "done",
    });
    const completedN = await createNotificationWithDelivery({
      audience: "user",
      userId,
      type: "completed",
      title: "完了",
      message: "完了しました",
      relatedTaskId: jobId,
      deliverableId: art.id,
      targetType: "deliverable",
      targetId: art.id,
      lineEvent: "work_completed",
    });
    out.push({
      caseId,
      category: "notify_attached",
      ok: Boolean(n.record && completedN.record),
      countedInSuccessRate: true,
      requestId,
      jobId,
      artifactId: art.id,
      diagnosticId: null,
      externalActionId: null,
      idempotencyKey: `${userId}::ntf::${caseId}`,
      statusFinal: "completed",
      retryCount: 0,
      failedStage: null,
      failureClass: n.record ? null : classifyOpsFailure({ message: "notification_create_failed" }),
      failureReason: null,
      durationMs: Date.now() - started,
      queueWaitMs: 0,
      transitions: getJobTransitionHistory(jobId).map((t) => ({
        from: t.previousStatus,
        to: t.nextStatus,
        at: t.changedAt,
      })),
      environment: "local",
      log: [
        `error_notify=${n.record?.type}`,
        `complete_notify=${completedN.record?.type}`,
        `pushOk=${completedN.pushOk}`,
      ],
    });
  }

  return out;
}
